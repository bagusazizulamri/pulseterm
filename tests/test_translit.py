import unittest
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from api.translit import romanize_line, enrich_lyrics


class TranslitTests(unittest.TestCase):
    def test_latin_passthrough(self):
        self.assertIsNone(romanize_line("Hello world, this is English."))
        self.assertIsNone(romanize_line("Lagu Indonesia tanpa aksara asing."))
        self.assertIsNone(romanize_line("12345 67890 !?#@"))

    def test_korean_romaja(self):
        res = romanize_line("보고 싶다")
        self.assertIsNotNone(res)
        self.assertEqual(res["script"], "korean")
        self.assertEqual(res["scriptLabel"], "Romaja")
        self.assertIn("bogo", res["roman"])
        self.assertIn("sipda", res["roman"])

    def test_japanese_romaji(self):
        res = romanize_line("残酷な天使のテーゼ")
        self.assertIsNotNone(res)
        self.assertEqual(res["script"], "japanese")
        self.assertEqual(res["scriptLabel"], "Romaji")
        self.assertIn("zankoku", res["roman"].lower())
        self.assertIn("tenshi", res["roman"].lower())

    def test_chinese_pinyin(self):
        res = romanize_line("月亮代表我的心", default_cjk_script="chinese")
        self.assertIsNotNone(res)
        self.assertEqual(res["script"], "chinese")
        self.assertEqual(res["scriptLabel"], "Pinyin")
        self.assertIn("yuè", res["roman"].lower())

    def test_cyrillic_translit(self):
        res = romanize_line("Группа крови")
        self.assertIsNotNone(res)
        self.assertEqual(res["script"], "cyrillic")
        self.assertEqual(res["scriptLabel"], "Translit")
        self.assertEqual(res["roman"], "Gruppa krovi")

    def test_enrich_lyrics_japanese_song(self):
        raw = {
            "plain": "少年よ 神話になれ",
            "synced": [
                {"text": "残酷な天使のテーゼ", "start": 1000, "end": 4000},
                {"text": "Like an angel with no sense of mercy", "start": 4000, "end": 7000}
            ]
        }
        enriched = enrich_lyrics(raw)
        self.assertTrue(enriched["has_roman"])
        self.assertEqual(enriched["script"], "japanese")
        self.assertEqual(enriched["script_label"], "Romaji")
        self.assertTrue(bool(enriched["synced"][0]["roman"]))
        # Latin line should have empty roman to prevent redundant line
        self.assertEqual(enriched["synced"][1]["roman"], "")


if __name__ == '__main__':
    unittest.main()
