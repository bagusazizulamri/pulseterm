"""Unit tests for LRCLIB parser and integration."""

import unittest
from api.lrclib import parse_enhanced_lrc, _tag_to_ms


class TestLrclibParser(unittest.TestCase):
    def test_tag_to_ms(self):
        self.assertEqual(_tag_to_ms("01", "23.45"), 83450)
        self.assertEqual(_tag_to_ms("00", "05.100"), 5100)
        self.assertEqual(_tag_to_ms("invalid", "time"), 0)

    def test_parse_enhanced_lrc_with_word_tags(self):
        sample = (
            "[00:10.00] <00:10.00> Dewi, <00:11.20> aku <00:12.00> mohon\n"
            "[00:15.00] <00:15.00> Beri <00:16.50> kesempatan"
        )
        parsed = parse_enhanced_lrc(sample)
        self.assertEqual(len(parsed), 2)

        # Line 1
        self.assertEqual(parsed[0]["text"], "Dewi, aku mohon")
        self.assertEqual(parsed[0]["start"], 10000)
        self.assertEqual(parsed[0]["end"], 15000)
        self.assertIsNotNone(parsed[0]["words"])
        self.assertEqual(len(parsed[0]["words"]), 3)
        self.assertEqual(parsed[0]["words"][0]["word"], "Dewi,")
        self.assertEqual(parsed[0]["words"][0]["start"], 10000)
        self.assertEqual(parsed[0]["words"][0]["end"], 11200)
        self.assertEqual(parsed[0]["words"][1]["word"], "aku")
        self.assertEqual(parsed[0]["words"][1]["start"], 11200)
        self.assertEqual(parsed[0]["words"][1]["end"], 12000)
        self.assertEqual(parsed[0]["words"][2]["word"], "mohon")
        self.assertEqual(parsed[0]["words"][2]["start"], 12000)
        self.assertEqual(parsed[0]["words"][2]["end"], 15000)

        # Line 2
        self.assertEqual(parsed[1]["text"], "Beri kesempatan")
        self.assertEqual(parsed[1]["start"], 15000)
        self.assertEqual(len(parsed[1]["words"]), 2)

    def test_parse_standard_lrc(self):
        sample = (
            "[00:05.50] First regular line\n"
            "[00:10.20] Second regular line"
        )
        parsed = parse_enhanced_lrc(sample)
        self.assertEqual(len(parsed), 2)
        self.assertEqual(parsed[0]["text"], "First regular line")
        self.assertEqual(parsed[0]["start"], 5500)
        self.assertEqual(parsed[0]["end"], 10200)
        self.assertIsNone(parsed[0]["words"])

    def test_parse_with_lyricsfile_yaml(self):
        sample_lrc = (
            "[00:01.00] Line one\n"
            "[00:08.00] Line two"
        )
        sample_yaml = """
version: '1.0'
lines:
- text: Line one
  start_ms: 1000
  end_ms: 4500
- text: Line two
  start_ms: 8000
  end_ms: 12000
"""
        parsed = parse_enhanced_lrc(sample_lrc, sample_yaml)
        self.assertEqual(len(parsed), 2)
        self.assertEqual(parsed[0]["start"], 1000)
        self.assertEqual(parsed[0]["end"], 4500)
        self.assertEqual(parsed[1]["start"], 8000)
        self.assertEqual(parsed[1]["end"], 12000)


if __name__ == "__main__":
    unittest.main()
