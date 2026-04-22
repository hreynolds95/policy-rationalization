import unittest

from compliance_rationalizer.url_ingest import _extract_text, _google_export_url


class TestUrlIngest(unittest.TestCase):
    def test_google_doc_url_converts_to_txt_export(self):
        url = "https://docs.google.com/document/d/abc123/edit?tab=t.0"
        self.assertEqual(
            _google_export_url(url),
            "https://docs.google.com/document/d/abc123/export?format=txt",
        )

    def test_google_sheet_url_converts_to_csv_export_with_gid(self):
        url = "https://docs.google.com/spreadsheets/d/sheet123/edit?gid=1704057432#gid=1704057432"
        self.assertEqual(
            _google_export_url(url),
            "https://docs.google.com/spreadsheets/d/sheet123/export?format=csv&gid=1704057432",
        )

    def test_extract_text_strips_html_tags(self):
        html = "<html><body><h1>Policy A</h1><p>Required language clause.</p></body></html>"
        text = _extract_text("https://example.com", html, "text/html")
        self.assertIn("Policy A", text)
        self.assertIn("Required language clause.", text)


if __name__ == "__main__":
    unittest.main()
