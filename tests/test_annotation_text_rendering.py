"""Display-only glyph checks; no specimen, font download or science fixture."""
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import image_workspace as worker

WINDOWS_CJK = os.name == "nt" and (Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts/msyh.ttc").is_file()


class AnnotationTextRendering(unittest.TestCase):
    def test_existing_latin_overlay_pixels_and_annotation_coordinates_unchanged(self):
        image = Image.new("RGB", (160, 40), "black")
        mark = {"kind": "text", "text": "A_ROI_1", "coordinates": [4, 4],
                "status": "hypothesized", "color": "cyan"}
        actual, annotations = worker.overlay(image, [mark], [])
        expected = image.copy()
        ImageDraw.Draw(expected).text((4, 4), mark["text"], fill="#45e8ff")
        self.assertEqual(actual.tobytes(), expected.tobytes())
        self.assertEqual(annotations[0]["coordinates"], [4, 4])
        self.assertEqual(annotations[0]["text"], mark["text"])
        self.assertEqual(image.getbbox(), None, "Display overlay leaves input pixels unchanged")

    def test_missing_optional_font_keeps_the_existing_fallback(self):
        with patch.object(worker.ImageFont, "truetype", side_effect=OSError("font unavailable")):
            self.assertIsNone(worker.annotation_text_font("带状区"))

    @unittest.skipUnless(WINDOWS_CJK, "Requires the existing Windows Microsoft YaHei font; no font is bundled/downloaded")
    def test_cjk_glyphs_are_distinct_from_each_other_and_the_missing_glyph(self):
        font = worker.annotation_text_font("带状区")
        self.assertIsNotNone(font)
        missing = bytes(font.getmask("\u0378"))
        first, second = bytes(font.getmask("带")), bytes(font.getmask("状"))
        self.assertNotEqual(first, missing)
        self.assertNotEqual(second, missing)
        self.assertNotEqual(first, second, "Different Chinese labels must not be identical tofu boxes")

    @unittest.skipUnless(WINDOWS_CJK, "Requires the existing Windows Microsoft YaHei font; no font is bundled/downloaded")
    def test_actual_overlay_renders_cjk_without_relabeling_or_moving_the_mark(self):
        image = Image.new("RGB", (160, 40), "black")
        mark = {"kind": "text", "text": "带状区", "coordinates": [4, 4], "status": "hypothesized"}
        actual, annotations = worker.overlay(image, [mark], [])
        missing = image.copy()
        ImageDraw.Draw(missing).text((4, 4), "\u0378" * 3, font=ImageFont.truetype("msyh.ttc", size=12), fill="#ffba30")
        self.assertNotEqual(actual.tobytes(), missing.tobytes())
        self.assertIsNotNone(actual.getbbox())
        self.assertEqual(annotations[0]["coordinates"], mark["coordinates"])
        self.assertEqual(annotations[0]["text"], mark["text"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
