import mistletoe
from mistletoe.block_token import BlockToken, Paragraph, Heading, CodeFence, BlockCode, List, ListItem, Quote
from mistletoe.span_token import SpanToken, RawText, InlineCode, Strong, Emphasis, Image
import json

def convert_to_notion_blocks(markdown_text, upload_callback=None):
    doc = mistletoe.Document(markdown_text)
    blocks = []
    
    def process_spans(children):
        if not children:
            return []
        rich_text = []
        for child in children:
            if isinstance(child, RawText):
                # Simple math parsing inline
                text = child.content
                parts = text.split('$')
                for i, part in enumerate(parts):
                    if i % 2 == 1 and part:
                        rich_text.append({"type": "equation", "equation": {"expression": part}})
                    elif part:
                        # Notion chunk limit for text is 2000
                        for chunk_idx in range(0, len(part), 2000):
                            rich_text.append({"type": "text", "text": {"content": part[chunk_idx:chunk_idx+2000]}})
            elif isinstance(child, InlineCode):
                for gc in child.children:
                    rich_text.append({"type": "text", "text": {"content": gc.content}, "annotations": {"code": True}})
            elif isinstance(child, Strong):
                inner = process_spans(child.children)
                for ann in inner:
                    ann.setdefault("annotations", {})["bold"] = True
                rich_text.extend(inner)
            elif isinstance(child, Emphasis):
                inner = process_spans(child.children)
                for ann in inner:
                    ann.setdefault("annotations", {})["italic"] = True
                rich_text.extend(inner)
            elif isinstance(child, Image):
                # Fallback for inline images if we didn't catch it as a block
                alt_text = "".join(c.content for c in child.children if hasattr(c, 'content'))
                rich_text.append({"type": "text", "text": {"content": f" [Image: {alt_text}] "}, "annotations": {"italic": True}})
            else:
                if getattr(child, 'children', None):
                    rich_text.extend(process_spans(child.children))
        return rich_text

    def process_block(block):
        if len(blocks) >= 99:
            return
            
        if isinstance(block, Heading):
            level = min(block.level, 3)
            blocks.append({
                "object": "block",
                f"heading_{level}": {
                    "rich_text": process_spans(block.children)
                }
            })
        elif isinstance(block, Paragraph):
            # Check for standalone Image
            if len(block.children) == 1 and isinstance(block.children[0], Image):
                img = block.children[0]
                if upload_callback:
                    file_id = upload_callback(img.src)
                    if file_id:
                        blocks.append({
                            "object": "block", "type": "image",
                            "image": {
                                "type": "file_upload",
                                "file_upload": {"id": file_id}
                            }
                        })
                        return
                        
            # Check for block math
            raw_text = ""
            for c in block.children:
                if hasattr(c, 'content'):
                    raw_text += c.content
            raw_text = raw_text.strip()
            if raw_text.startswith("$$") and raw_text.endswith("$$"):
                blocks.append({
                    "object": "block", "type": "equation",
                    "equation": {"expression": raw_text[2:-2].strip()}
                })
                return
            blocks.append({
                "object": "block", "type": "paragraph",
                "paragraph": {
                    "rich_text": process_spans(block.children)
                }
            })
        elif isinstance(block, CodeFence) or isinstance(block, BlockCode):
            code_text = ""
            if hasattr(block, 'children') and len(block.children) > 0 and isinstance(block.children[0], RawText):
                code_text = block.children[0].content
            
            lang = getattr(block, 'language', 'plain text')
            if not lang: lang = "plain text"
            lang = lang.lower()
            lang_map = {
                "js": "javascript", "ts": "typescript", "py": "python", "sh": "shell", "bash": "shell", 
                "c++": "c++", "cpp": "c++", "c#": "c#", "cs": "c#", "html": "html", "css": "css", 
                "json": "json", "yaml": "yaml", "yml": "yaml", "markdown": "markdown", "md": "markdown",
                "java": "java", "go": "go", "rust": "rust", "rs": "rust", "sql": "sql", "xml": "xml"
            }
            code_language = lang_map.get(lang, "plain text")
            
            blocks.append({
                "object": "block", "type": "code",
                "code": {
                    "rich_text": [{"type": "text", "text": {"content": code_text[:2000]}}],
                    "language": code_language
                }
            })
        elif isinstance(block, List):
            for item in block.children:
                if len(blocks) >= 99: break
                if getattr(item, 'children', None) and len(item.children) > 0:
                    blocks.append({
                        "object": "block", "type": "bulleted_list_item",
                        "bulleted_list_item": {
                            "rich_text": process_spans(item.children[0].children)
                        }
                    })
        elif isinstance(block, Quote):
            blocks.append({
                "object": "block", "type": "quote",
                "quote": {
                    "rich_text": process_spans(block.children[0].children) if block.children else []
                }
            })
        else:
            if getattr(block, 'children', None):
                for child in block.children:
                    process_block(child)

    for block in doc.children:
        process_block(block)
        
    return blocks[:100]
