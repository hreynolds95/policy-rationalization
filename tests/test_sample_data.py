import unittest

from compliance_rationalizer.sample_data import load_sample_documents, sample_urls_text


class TestSampleData(unittest.TestCase):
    def test_sample_documents_are_ready_for_demo(self):
        docs = load_sample_documents()
        self.assertGreaterEqual(len(docs), 3)
        self.assertTrue(all(doc.text for doc in docs))

    def test_sample_urls_text_has_multiple_lines(self):
        lines = [line for line in sample_urls_text().splitlines() if line.strip()]
        self.assertGreaterEqual(len(lines), 3)


if __name__ == "__main__":
    unittest.main()
