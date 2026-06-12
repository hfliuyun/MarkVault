

import markdown
# 包含数学公式的 Markdown 文本示例

html_head = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" type="image/x-icon" href="static/favicon.ico">
    <!-- Atom One Dark 主题样式 -->
    <link rel="stylesheet"href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/atom-one-dark.min.css"/>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css" integrity="sha384-5TcZemv2l/9On385z///+d7MSYlvIEw9FuZTIdZ14vJLqWphw7e7ZPuOiCHJcFCP" crossorigin="anonymous">
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js" integrity="sha384-cMkvdD8LoxVzGF/RPUKAcvmm49FQ0oxwDF3BGKtDXcEc+T1b2N+teh/OJfpU0jr6" crossorigin="anonymous"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/contrib/auto-render.min.js" integrity="sha384-hCXGrW6PitJEwbkoStFjeJxv+fSOOQKOPbJxSfM6G5sWZjAyWhXiTIIAmQqnlLlh" crossorigin="anonymous"></script>
    <!-- highlight.js 核心库 -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/highlight.min.js"></script>
    <script>
    document.addEventListener("DOMContentLoaded", function() {
        renderMathInElement(document.body, {
          // customised options
          // • auto-render specific keys, e.g.:
          delimiters: [
              {left: '$$', right: '$$', display: true},
              {left: '$', right: '$', display: false},
              {left: '\\(', right: '\\)', display: false},
              {left: '\\[', right: '\\]', display: true}
          ],
          // • rendering keys, e.g.:
          throwOnError : false
        });

        // 2. 使用 highlight.js 高亮所有代码块
        hljs.highlightAll();
    });
</script>
<!-- Custom styles for dark theme -->
    <style>
        body {
            background-color: #282c34; /* Atom One Dark 背景色 */
            color: #abb2bf; /* Atom One Dark 普通文本颜色 */
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            line-height: 1.6;
            padding: 20px;
        }
        h1, h2, h3, h4, h5, h6 {
            color: #61afef; /* 标题使用主题中的蓝色 */
            border-bottom: 1px solid #3e4451;
            padding-bottom: 8px;
        }
        a {
            color: #98c379; /* 链接使用主题中的绿色 */
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        hr {
            border-color: #3e4451; /* 分割线颜色 */
        }
        /* 为图片添加一些样式，使其在暗色背景下更突出 */
        img {
            background-color: #fff;
            padding: 5px;
            border-radius: 5px;
            max-width: 100%;
            height: auto;
            display: block;
            margin: 1em 0;
        }
        /* 代码块样式 */
        code {
            /*居中显示*/
            /*text-align: center;*/
        }

    </style>

</head>
<body>
"""
html_tail = """
</body>
</html>
"""

# markdown_file_path = "posts/逻辑回归.md"
# with open(markdown_file_path, 'r', encoding='utf-8') as f:
#     markdown_text_with_math = f.read()

# html = markdown.markdown(markdown_text_with_math, extensions=['mdx_math',"tables", "footnotes", "fenced_code"], extension_configs={'mdx_math': {'use_gitlab_delimiters': True}})
# print(html)
# with open('test_math_render.html', 'w', encoding='utf-8') as f:
#     f.write(html_head)
#     f.write(html)
#     f.write(html_tail)

def render_markdown_to_html(markdown_text):
    html = markdown.markdown(markdown_text, extensions=['mdx_math',"tables", "footnotes", "fenced_code"], extension_configs={'mdx_math': {'use_gitlab_delimiters': True}})
    return html_head + html + html_tail
