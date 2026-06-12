import markdown


def render_markdown_to_html(markdown_text):
    """Render Markdown to an HTML fragment; math is rendered by the Vue client."""
    return markdown.markdown(
        markdown_text,
        extensions=["tables", "footnotes", "fenced_code"],
    )
