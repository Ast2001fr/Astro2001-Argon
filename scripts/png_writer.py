#!/usr/bin/env python3
"""
Pure-Python fast PNG encoder using standard library struct and zlib.
Supports RGB (color_type=2) and RGBA (color_type=6).
"""
import struct
import zlib


def write_png(filepath, width, height, raw_scanlines, color_type=6):
    """
    Write a PNG image file.
    raw_scanlines: bytearray or bytes of length height * (1 + width * channels),
    where the first byte of each row is the PNG filter byte (0 = None).
    color_type: 2 for RGB (3 bytes/px), 6 for RGBA (4 bytes/px).
    """
    def make_chunk(chunk_type, data):
        crc = zlib.crc32(chunk_type)
        crc = zlib.crc32(data, crc) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + chunk_type + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, color_type, 0, 0, 0)
    compressed = zlib.compress(raw_scanlines, 6)
    png_bytes = (
        b"\x89PNG\r\n\x1a\n"
        + make_chunk(b"IHDR", ihdr)
        + make_chunk(b"IDAT", compressed)
        + make_chunk(b"IEND", b"")
    )
    with open(filepath, "wb") as f:
        f.write(png_bytes)
