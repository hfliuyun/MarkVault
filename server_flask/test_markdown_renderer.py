import unittest

from app.services.markdown_renderer import render_markdown_to_html


class MarkdownRendererSecurityTestCase(unittest.TestCase):
    def test_rendered_html_removes_script_events_and_dangerous_protocols(self):
        html = render_markdown_to_html(
            """# 安全标题

<script>alert("xss")</script>

<a href="javascript:alert(1)" onclick="evil()">bad link</a>

<img src="javascript:alert(1)" onerror="evil()" alt="bad image">
"""
        )
        lower_html = html.lower()

        self.assertIn('id="安全标题"', html)
        self.assertNotIn("<script", lower_html)
        self.assertNotIn("alert(", lower_html)
        self.assertNotIn("onclick", lower_html)
        self.assertNotIn("onerror", lower_html)
        self.assertNotIn("javascript:", lower_html)

    def test_common_markdown_output_is_preserved(self):
        html = render_markdown_to_html(
            """## Section

| A | B |
| - | - |
| 1 | 2 |

```python
print("ok")
```

![Alt](images/example.png)

[Open](https://example.com)
"""
        )

        self.assertIn('id="section"', html)
        self.assertIn("<table>", html)
        self.assertIn("<pre><code", html)
        self.assertIn('class="language-python"', html)
        self.assertIn('src="images/example.png"', html)
        self.assertIn('alt="Alt"', html)
        self.assertIn('href="https://example.com"', html)


if __name__ == "__main__":
    unittest.main()
