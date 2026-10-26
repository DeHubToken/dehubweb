"""Bounded public product metadata import; never executes page code or starts generation."""
import concurrent.futures
import http.client
import ipaddress
import json
import re
import socket
import ssl
import threading
import time
from collections import deque
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.parse import quote, urljoin, urlsplit, urlunsplit

from fastapi import HTTPException

MAX_BYTES = 2 * 1024 * 1024
DEADLINE_SECONDS = 10
MAX_REDIRECTS = 3
_dns_pool = concurrent.futures.ThreadPoolExecutor(max_workers=4)
_dns_slots = threading.BoundedSemaphore(4)
_imports = threading.BoundedSemaphore(2)
_rate_lock = threading.Lock()
_rates = {}


def validated_url(value):
    if not isinstance(value, str) or len(value) > 4096 or any(ord(c) < 32 or ord(c) == 127 for c in value):
        raise HTTPException(400, 'Enter a public HTTPS product URL.')
    try:
        parsed = urlsplit(value.strip())
        if parsed.scheme != 'https' or parsed.username is not None or parsed.password is not None or parsed.port not in (None, 443):
            raise ValueError()
        host = (parsed.hostname or '').rstrip('.').encode('idna').decode('ascii').lower()
        if len(host) > 253 or '.' not in host or any(not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', label) for label in host.split('.')):
            raise ValueError()
        if host.endswith(('.localhost', '.local', '.internal', '.lan', '.home', '.test')):
            raise ValueError()
        try:
            ipaddress.ip_address(host)
        except ValueError:
            pass
        else:
            raise ValueError()
        path = quote(parsed.path or '/', safe="/%:@!$&'()*+,;=-._~")
        query = quote(parsed.query, safe="/%?:@!$&'()*+,;=-._~")
        return urlunsplit(('https', host, path, query, ''))
    except (ValueError, UnicodeError):
        raise HTTPException(400, 'Enter a public HTTPS product URL.') from None


def public_address(value):
    try:
        address = ipaddress.ip_address(value)
        if not address.is_global or address.is_multicast or address.is_reserved:
            return False
        if isinstance(address, ipaddress.IPv6Address):
            if address.ipv4_mapped or address.sixtofour or address.teredo:
                return False
            if address in ipaddress.ip_network('64:ff9b::/96') or address in ipaddress.ip_network('64:ff9b:1::/48'):
                return False
        return True
    except ValueError:
        return False


def resolve_public(host, deadline):
    if not _dns_slots.acquire(blocking=False):
        raise HTTPException(429, 'Product import is busy. Try again shortly.')
    try:
        future = _dns_pool.submit(socket.getaddrinfo, host, 443, 0, socket.SOCK_STREAM)
    except BaseException:
        _dns_slots.release()
        raise
    future.add_done_callback(lambda unused: _dns_slots.release())
    try:
        answers = future.result(timeout=max(0.001, deadline - time.monotonic()))
    except concurrent.futures.TimeoutError:
        raise HTTPException(504, 'The product page took too long to respond.') from None
    except OSError:
        raise HTTPException(502, 'The product website could not be reached.') from None
    addresses = list(dict.fromkeys(answer[4][0] for answer in answers if answer[0] in (socket.AF_INET, socket.AF_INET6)))
    if not addresses or len(addresses) > 16 or not all(public_address(address) for address in addresses):
        raise HTTPException(400, 'This website address is not allowed.')
    return addresses[0]


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    """Connect only to the checked address, retaining hostname verification and SNI."""
    def __init__(self, host, address, timeout):
        super().__init__(host, timeout=timeout, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        sock = socket.create_connection((self.address, 443), self.timeout)
        try:
            self.sock = self._context.wrap_socket(sock, server_hostname=self.host)
        except BaseException:
            sock.close()
            raise


def _stop_socket(sock):
    if sock:
        try:
            sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass


def fetch_html(value):
    current = validated_url(value)
    deadline = time.monotonic() + DEADLINE_SECONDS
    visited = set()
    for step in range(MAX_REDIRECTS + 1):
        if current in visited:
            raise HTTPException(502, 'The product website redirected repeatedly.')
        visited.add(current)
        parsed = urlsplit(current)
        address = resolve_public(parsed.hostname, deadline)
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise HTTPException(504, 'The product page took too long to respond.')
        connection = PinnedHTTPSConnection(parsed.hostname, address, remaining)
        timer = None
        try:
            connection.connect()
            timer = threading.Timer(max(0.001, deadline - time.monotonic()), _stop_socket, (connection.sock,))
            timer.daemon = True
            timer.start()
            target = parsed.path + ('?' + parsed.query if parsed.query else '')
            connection.request('GET', target, headers={'Accept': 'text/html, application/xhtml+xml', 'Accept-Encoding': 'identity', 'User-Agent': 'DeHub Product Import/1.0'})
            response = connection.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                location = response.getheader('Location')
                if not location or step == MAX_REDIRECTS:
                    raise HTTPException(502, 'The product website redirected repeatedly.')
                current = validated_url(urljoin(current, location))
                continue
            if response.status != 200:
                raise HTTPException(502, 'The product website did not return a usable page. Enter the details manually.')
            content_type = response.getheader('Content-Type', '').split(';', 1)[0].strip().lower()
            if content_type not in ('text/html', 'application/xhtml+xml') or response.getheader('Content-Encoding', '').lower() not in ('', 'identity'):
                raise HTTPException(415, 'This page format is not supported. Enter the details manually.')
            length = response.getheader('Content-Length')
            if length and (not length.isdigit() or int(length) > MAX_BYTES):
                raise HTTPException(413, 'This product page is too large to import.')
            data = bytearray()
            while True:
                if time.monotonic() >= deadline:
                    raise HTTPException(504, 'The product page took too long to respond.')
                chunk = response.read1(min(65536, MAX_BYTES + 1 - len(data)))
                if time.monotonic() >= deadline:
                    raise HTTPException(504, 'The product page took too long to respond.')
                if not chunk:
                    break
                data.extend(chunk)
                if len(data) > MAX_BYTES:
                    raise HTTPException(413, 'This product page is too large to import.')
            return current, bytes(data).decode('utf-8', errors='replace')
        except (TimeoutError, socket.timeout):
            raise HTTPException(504, 'The product page took too long to respond.') from None
        except (OSError, http.client.HTTPException, UnicodeError):
            if time.monotonic() >= deadline:
                raise HTTPException(504, 'The product page took too long to respond.') from None
            raise HTTPException(502, 'The product website could not be reached.') from None
        finally:
            if timer:
                timer.cancel()
            connection.close()
    raise HTTPException(502, 'The product website redirected repeatedly.')


class MetadataParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta = {}
        self.json_blocks = []
        self.script = None
        self.script_size = 0
        self.title = ''
        self.in_title = False

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == 'meta' and len(self.meta) < 100:
            key = attributes.get('property') or attributes.get('name')
            if key and key.lower() not in self.meta:
                self.meta[key.lower()] = (attributes.get('content') or '')[:2000]
        if tag == 'script' and (attributes.get('type') or '').lower().strip() == 'application/ld+json' and len(self.json_blocks) < 20:
            self.script = []
        if tag == 'title':
            self.in_title = True

    def handle_endtag(self, tag):
        if tag == 'script' and self.script is not None:
            self.json_blocks.append(''.join(self.script))
            self.script = None
        if tag == 'title':
            self.in_title = False

    def handle_data(self, data):
        if self.script is not None:
            self.script_size += len(data)
            if self.script_size <= MAX_BYTES:
                self.script.append(data)
        if self.in_title:
            self.title = (self.title + data)[:180]


def clean_text(value, limit=1000):
    if not isinstance(value, str):
        return ''
    # Metadata fields are displayed as text, never HTML or instructions.
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]*>', ' ', value)).strip()[:limit]


def product_nodes(blocks):
    count = 0
    for block in blocks:
        try:
            root = json.loads(block)
        except (ValueError, RecursionError):
            continue
        queue = deque([(root, 0)])
        while queue:
            value, depth = queue.popleft()
            count += 1
            if count > 2000:
                return
            if depth > 20:
                continue
            if isinstance(value, dict):
                types = value.get('@type', [])
                types = [types] if isinstance(types, str) else types
                if isinstance(types, list) and any(kind == 'Product' or kind == 'https://schema.org/Product' for kind in types):
                    yield value
                queue.extend((item, depth + 1) for item in value.values() if isinstance(item, (dict, list)))
            elif isinstance(value, list):
                queue.extend((item, depth + 1) for item in value[:200])


def image_candidates(value, base):
    values = value if isinstance(value, list) else [value]
    result = []
    for item in values[:5]:
        if isinstance(item, dict):
            item = item.get('url') or item.get('contentUrl')
        if not isinstance(item, str):
            continue
        try:
            candidate = validated_url(urljoin(base, item))
        except HTTPException:
            continue
        if candidate not in result:
            result.append(candidate)
    return result


def extract_metadata(html, source, final):
    parser = MetadataParser()
    try:
        parser.feed(html)
    except (ValueError, RecursionError):
        raise HTTPException(422, 'Product details could not be read. Enter them manually.') from None
    candidates = []
    for product in product_nodes(parser.json_blocks):
        name = clean_text(product.get('name'), 180)
        if not name:
            continue
        brand = product.get('brand')
        brand = clean_text(brand.get('name') if isinstance(brand, dict) else brand, 180)
        offers = product.get('offers', {})
        offers = offers[0] if isinstance(offers, list) and offers else offers
        offers = offers if isinstance(offers, dict) else {}
        price = str(offers.get('price', ''))
        currency = offers.get('priceCurrency', '')
        candidates.append({'name': name, 'description': clean_text(product.get('description')), 'brand': brand,
                           'imageUrls': image_candidates(product.get('image'), final),
                           'price': price if re.fullmatch(r'\d{1,12}(?:\.\d{1,4})?', price) else None,
                           'currency': currency.upper() if isinstance(currency, str) and re.fullmatch(r'[a-zA-Z]{3}', currency) else None,
                           'source': 'JSON-LD Product'})
        if len(candidates) == 5:
            break
    if not candidates:
        name = clean_text(parser.meta.get('og:title') or parser.title, 180)
        description = clean_text(parser.meta.get('og:description') or parser.meta.get('description'))
        if name and description:
            candidates.append({'name': name, 'description': description, 'brand': clean_text(parser.meta.get('og:site_name'), 180),
                               'imageUrls': image_candidates(parser.meta.get('og:image'), final), 'price': None, 'currency': None, 'source': 'Page metadata'})
    if not candidates:
        raise HTTPException(422, 'No usable product details were found. Enter them manually.')
    return {'sourceUrl': source, 'finalUrl': final, 'retrievedAt': datetime.now(timezone.utc).isoformat(), 'products': candidates,
            'reviewRequired': True}


def import_product(url, owner):
    now = time.monotonic()
    with _rate_lock:
        for key in list(_rates):
            if not _rates[key] or _rates[key][-1] < now - 600:
                del _rates[key]
        history = _rates.setdefault(owner, deque())
        while history and history[0] < now - 600:
            history.popleft()
        if len(history) >= 10 or len(_rates) > 10000:
            raise HTTPException(429, 'Too many product imports. Try again later.')
        history.append(now)
    if not _imports.acquire(blocking=False):
        raise HTTPException(429, 'Product import is busy. Try again shortly.')
    try:
        source = validated_url(url)
        final, html = fetch_html(source)
        return extract_metadata(html, source, final)
    finally:
        _imports.release()
