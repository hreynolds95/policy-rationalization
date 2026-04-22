import unittest
from pathlib import Path

from compliance_rationalizer.grouping import build_groups
from compliance_rationalizer.models import Document, SimilarityEdge


class TestGrouping(unittest.TestCase):
    def test_build_groups_unions_connected_docs(self):
        docs = [
            Document(id=0, path=Path("a.md"), title="a", text="a"),
            Document(id=1, path=Path("b.md"), title="b", text="b"),
            Document(id=2, path=Path("c.md"), title="c", text="c"),
        ]
        edges = [
            SimilarityEdge(left_id=0, right_id=1, score=0.9),
            SimilarityEdge(left_id=1, right_id=2, score=0.8),
        ]

        groups = build_groups(docs, edges)
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0].document_ids, (0, 1, 2))


if __name__ == "__main__":
    unittest.main()
