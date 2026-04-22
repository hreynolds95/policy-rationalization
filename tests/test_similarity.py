import unittest
from pathlib import Path

from compliance_rationalizer.models import Document
from compliance_rationalizer.similarity import pairwise_similarity


class TestSimilarity(unittest.TestCase):
    def test_pairwise_similarity_detects_related_docs(self):
        docs = [
            Document(id=0, path=Path("a.md"), title="a", text="records retention legal regulation"),
            Document(id=1, path=Path("b.md"), title="b", text="record retention legal regulatory requirements"),
            Document(id=2, path=Path("c.md"), title="c", text="vendor risk onboarding controls"),
        ]

        edges = pairwise_similarity(docs, threshold=0.2)
        self.assertTrue(edges)
        top = edges[0]
        self.assertEqual({top.left_id, top.right_id}, {0, 1})


if __name__ == "__main__":
    unittest.main()
