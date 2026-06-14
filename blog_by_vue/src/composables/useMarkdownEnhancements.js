import renderMathInElement from 'katex/dist/contrib/auto-render';
import hljs from 'highlight.js';

const resolveContainer = (containerOrRef) => containerOrRef?.value || containerOrRef;

export function useMarkdownEnhancements() {
  const enhanceMarkdownContent = (containerOrRef) => {
    const markdownContainer = resolveContainer(containerOrRef);
    if (!markdownContainer) {
      return;
    }

    markdownContainer.querySelectorAll('.code-block-wrapper').forEach((wrapper) => {
      const pre = wrapper.querySelector('pre');
      if (pre && wrapper.parentNode) {
        wrapper.parentNode.insertBefore(pre, wrapper);
      }
      wrapper.remove();
    });

    renderMathInElement(markdownContainer, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true }
      ],
      throwOnError: false,
      errorColor: '#cc0000'
    });

    markdownContainer.querySelectorAll('pre code').forEach((block) => {
      hljs.highlightElement(block);
    });

    markdownContainer.querySelectorAll('pre > code').forEach(codeBlock => {
      const pre = codeBlock.parentElement;
      if (pre.parentNode.classList.contains('code-block-wrapper')) {
        return;
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'code-block-wrapper';

      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);

      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-code-btn';
      copyBtn.type = 'button';
      copyBtn.title = 'Copy Code';
      copyBtn.textContent = 'Copy';

      copyBtn.addEventListener('click', async () => {
        const codeToCopy = codeBlock.innerText;
        try {
          await navigator.clipboard.writeText(codeToCopy);
          copyBtn.textContent = '已复制';
          copyBtn.classList.add('copied');
        } catch (err) {
          copyBtn.textContent = '失败';
        } finally {
          setTimeout(() => {
            copyBtn.textContent = '复制';
            copyBtn.classList.remove('copied');
          }, 2000);
        }
      });

      copyBtn.textContent = '复制';
      wrapper.appendChild(copyBtn);
    });
  };

  return {
    enhanceMarkdownContent,
  };
}
