import socket
import time
import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

import product_import as importer
import server


class ProductImportTests(unittest.TestCase):
    def setUp(self):
        importer._rates.clear()

    def test_rejects_non_public_url_forms(self):
        for value in ('http://example.com', 'https://user:secret@example.com', 'https://example.com:444',
                      'https://127.0.0.1', 'https://[::1]', 'https://2130706433', 'https://localhost',
                      'https://metadata.google.internal', 'https://example.com\r\nX: injected', 'https://example..com'):
            with self.subTest(value=value), self.assertRaises(HTTPException) as error:
                importer.validated_url(value)
            self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(importer.validated_url('https://Shop.Example.com:443/product?q=tea#section'), 'https://shop.example.com/product?q=tea')

    def test_rejects_private_reserved_and_translated_addresses(self):
        for value in ('127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254',
                      '100.64.0.1', '0.0.0.0', '224.0.0.1', '192.0.2.1', '::1', 'fc00::1', 'fe80::1',
                      '::ffff:127.0.0.1', '64:ff9b::7f00:1', '2002:7f00:1::1'):
            self.assertFalse(importer.public_address(value), value)
        self.assertTrue(importer.public_address('8.8.8.8'))
        self.assertTrue(importer.public_address('2606:4700:4700::1111'))

    def test_dns_rejects_mixed_public_and_private_answers(self):
        answers = [(socket.AF_INET, socket.SOCK_STREAM, 6, '', (value, 443)) for value in ('8.8.8.8', '127.0.0.1')]
        with patch.object(socket, 'getaddrinfo', return_value=answers), self.assertRaises(HTTPException) as error:
            importer.resolve_public('shop.example.com', time.monotonic() + 1)
        self.assertEqual(error.exception.status_code, 400)

    def test_connection_pins_ip_and_keeps_hostname_tls_verification(self):
        connection = importer.PinnedHTTPSConnection('shop.example.com', '8.8.8.8', time.monotonic() + 2)
        raw = Mock()
        context = Mock()
        connection._context = context
        with patch.object(socket, 'create_connection', return_value=raw) as connect:
            connection.connect()
        self.assertEqual(connect.call_args.args[0], ('8.8.8.8', 443))
        self.assertGreater(connect.call_args.args[1], 0)
        self.assertLessEqual(connect.call_args.args[1], 2)
        context.wrap_socket.assert_called_once_with(raw, server_hostname='shop.example.com')

    def test_tcp_and_tls_share_one_absolute_deadline(self):
        raw, context = Mock(), Mock()
        with patch.object(importer.time, 'monotonic', side_effect=[100, 100, 103]):
            connection = importer.PinnedHTTPSConnection('shop.example.com', '8.8.8.8', 102)
            connection._context = context
            with patch.object(socket, 'create_connection', return_value=raw), self.assertRaises(TimeoutError):
                connection.connect()
        context.wrap_socket.assert_not_called()
        raw.close.assert_called_once()
        raw, context = Mock(), Mock()
        with patch.object(importer.time, 'monotonic', side_effect=[100, 100, 101, 103]):
            connection = importer.PinnedHTTPSConnection('shop.example.com', '8.8.8.8', 102)
            connection._context = context
            with patch.object(socket, 'create_connection', return_value=raw), self.assertRaises(TimeoutError):
                connection.connect()
        raw.settimeout.assert_called_once_with(1)
        context.wrap_socket.return_value.close.assert_called_once()

    def response(self, body=b'<html></html>', status=200, headers=None):
        headers = {'Content-Type': 'text/html', **(headers or {})}
        response = Mock(status=status)
        response.getheader.side_effect = lambda key, default=None: headers.get(key, default)
        response.read1.side_effect = [body, b'']
        return response

    def fetch(self, responses, url='https://shop.example.com/product'):
        connections = []
        for response in responses:
            connection = Mock()
            connection.getresponse.return_value = response
            connections.append(connection)
        factory = patch.object(importer, 'PinnedHTTPSConnection', side_effect=connections)
        resolver = patch.object(importer, 'resolve_public', return_value='8.8.8.8')
        return factory, resolver

    def test_redirect_validates_private_target_before_another_connection(self):
        factory, resolver = self.fetch([self.response(status=302, headers={'Location': 'https://127.0.0.1/secret'})])
        with factory as connect, resolver, self.assertRaises(HTTPException) as error:
            importer.fetch_html('https://shop.example.com/product')
        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(connect.call_count, 1)

    def test_public_redirect_resolves_and_pins_each_host_independently(self):
        factory, resolver = self.fetch([self.response(status=302, headers={'Location': 'https://other.example.com/item'}), self.response(b'<title>Tea</title>')])
        with factory as connect, resolver as resolve:
            final, html = importer.fetch_html('https://shop.example.com/product')
        self.assertEqual(final, 'https://other.example.com/item')
        self.assertIn('Tea', html)
        self.assertEqual([call.args[0] for call in resolve.call_args_list], ['shop.example.com', 'other.example.com'])
        self.assertEqual([call.args[:2] for call in connect.call_args_list], [('shop.example.com', '8.8.8.8'), ('other.example.com', '8.8.8.8')])

    def test_bounds_content_types_encoding_and_declared_and_streamed_sizes(self):
        cases = [(self.response(headers={'Content-Type': 'application/pdf'}), 415),
                 (self.response(headers={'Content-Encoding': 'gzip'}), 415),
                 (self.response(headers={'Content-Length': str(importer.MAX_BYTES + 1)}), 413),
                 (self.response(b'x' * (importer.MAX_BYTES + 1)), 413)]
        for response, expected in cases:
            factory, resolver = self.fetch([response])
            with factory, resolver, self.assertRaises(HTTPException) as error:
                importer.fetch_html('https://shop.example.com/product')
            self.assertEqual(error.exception.status_code, expected)

    def test_socket_deadline_covers_slow_header_and_body_reads(self):
        response = self.response()
        response.read1.side_effect = TimeoutError()
        factory, resolver = self.fetch([response])
        with factory, resolver, self.assertRaises(HTTPException) as error:
            importer.fetch_html('https://shop.example.com/product')
        self.assertEqual(error.exception.status_code, 504)

    def test_imports_structured_product_without_inventing_brand_voice_or_prices(self):
        html = '''<script type="application/ld+json">{"@graph":[{"@type":"Product","name":"Tea tin","description":"<b>Whole leaf</b> tea","brand":{"name":"North"},"image":["/tea.jpg","https://127.0.0.1/private"],"offers":{"price":"12.50","priceCurrency":"gbp"}}]}</script>'''
        result = importer.extract_metadata(html, 'https://shop.example.com/product', 'https://shop.example.com/product')
        self.assertTrue(result['reviewRequired'])
        product = result['products'][0]
        self.assertEqual(product['name'], 'Tea tin')
        self.assertEqual(product['description'], 'Whole leaf tea')
        self.assertEqual(product['brand'], 'North')
        self.assertEqual(product['price'], '12.50')
        self.assertEqual(product['currency'], 'GBP')
        self.assertEqual(product['imageUrls'], ['https://shop.example.com/tea.jpg'])
        self.assertNotIn('voice', product)

    def test_metadata_fallback_is_identified_and_missing_facts_stay_missing(self):
        result = importer.extract_metadata('<meta property="og:title" content="Tea"><meta name="description" content="Loose leaf tea">', 'https://shop.example.com', 'https://shop.example.com')
        product = result['products'][0]
        self.assertEqual(product['source'], 'Page metadata')
        self.assertIsNone(product['price'])
        self.assertEqual(product['brand'], '')
        with self.assertRaises(HTTPException) as error:
            importer.extract_metadata('<html>No product metadata</html>', 'https://shop.example.com', 'https://shop.example.com')
        self.assertEqual(error.exception.status_code, 422)

    def test_rate_limit_and_concurrency_never_start_unbounded_fetches(self):
        with patch.object(importer, 'fetch_html', return_value=('https://shop.example.com', '<title>Tea</title><meta name="description" content="Whole leaf">')) as fetch:
            for _ in range(10):
                importer.import_product('https://shop.example.com', 'alice')
            with self.assertRaises(HTTPException) as error:
                importer.import_product('https://shop.example.com', 'alice')
            self.assertEqual(error.exception.status_code, 429)
            self.assertEqual(fetch.call_count, 10)
        with patch.object(importer, '_imports') as slots, patch.object(importer, 'fetch_html') as fetch:
            slots.acquire.return_value = False
            with self.assertRaises(HTTPException):
                importer.import_product('https://shop.example.com', 'bob')
            fetch.assert_not_called()

    def test_authenticated_route_never_fetches_for_an_unverified_session(self):
        client = TestClient(server.app)
        with patch('access.identity', side_effect=HTTPException(401, 'Sign in')), patch.object(importer, 'import_product') as fetch:
            self.assertEqual(client.post('/marketing/import-product', data={'url': 'https://shop.example.com'}).status_code, 401)
            fetch.assert_not_called()
        with patch('access.identity', return_value='alice'), patch.object(importer, 'import_product', return_value={'reviewRequired': True}) as fetch:
            response = client.post('/marketing/import-product', headers={'x-dehub-token': 'session'}, data={'url': 'https://shop.example.com'})
            self.assertEqual(response.status_code, 200)
            fetch.assert_called_once_with('https://shop.example.com', 'alice')


if __name__ == '__main__':
    unittest.main()
