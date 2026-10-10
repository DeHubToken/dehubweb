"""Serve narrowly signed provider inputs from DeHub; no public upload hosts."""
from access import media_url


def upload(path):
    return media_url(path, lifetime=21600)
