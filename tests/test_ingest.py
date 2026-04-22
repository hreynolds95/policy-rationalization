import tempfile
import unittest
from pathlib import Path

from compliance_rationalizer.ingest import load_documents_from_policy_csv


class TestIngest(unittest.TestCase):
    def test_load_documents_from_policy_csv(self):
        with tempfile.TemporaryDirectory() as td:
            csv_path = Path(td) / "policies.csv"
            csv_path.write_text(
                "policy_name,content\nPolicy A,Retention and legal hold requirements\nPolicy B,Vendor controls and due diligence\n",
                encoding="utf-8",
            )
            docs = load_documents_from_policy_csv(csv_path)
            self.assertEqual(len(docs), 2)
            self.assertEqual(docs[0].title, "Policy A")

    def test_load_documents_from_policy_csv_rejects_google_auth_html(self):
        with tempfile.TemporaryDirectory() as td:
            csv_path = Path(td) / "policies.csv"
            csv_path.write_text(
                "<!DOCTYPE html><html><body>Sign in to your Google Account docs.google.com</body></html>",
                encoding="utf-8",
            )
            with self.assertRaises(ValueError):
                load_documents_from_policy_csv(csv_path)


if __name__ == "__main__":
    unittest.main()
