<script setup>
import { ref } from 'vue';
import PostMetadata from '@/components/post/PostMetadata.vue';

defineProps({
  article: {
    type: Object,
    required: true,
  },
});

const markdownContainer = ref(null);

defineExpose({
  markdownContainer,
});
</script>

<template>
  <article class="post-content-card">
    <h1 class="post-title">{{ article.title }}</h1>
    <PostMetadata :article="article" />
    <div ref="markdownContainer" class="markdown-body" v-html="article.content"></div>
  </article>
</template>

<style>
.post-title {
  margin: 0 0 12px;
  color: var(--blog-text);
  font-size: 36px;
  line-height: 1.25;
  font-weight: 600;
}

.markdown-body {
  font-family: var(--blog-font);
  line-height: 1.75;
  color: var(--blog-text);
  font-size: 16px;
  overflow-wrap: break-word;
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 {
  color: var(--blog-text);
  line-height: 1.35;
}

.markdown-body h2 {
  margin-top: 2em;
  padding-bottom: .35em;
  border-bottom: 1px solid var(--blog-border);
}

.markdown-body p,
.markdown-body li {
  color: var(--blog-subtle);
}

.markdown-body a {
  color: var(--blog-accent);
}

.markdown-body blockquote {
  margin: 1.4em 0;
  padding: 2px 0 2px 16px;
  color: var(--blog-muted);
  border-left: 3px solid var(--blog-border-strong);
}

.markdown-body table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.4em 0;
  display: block;
  overflow-x: auto;
}

.markdown-body th,
.markdown-body td {
  padding: 8px 10px;
  border: 1px solid var(--blog-border);
}

.markdown-body img {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
}

.code-block-wrapper {
  position: relative;
  margin: 1.2em 0;
}

.markdown-body pre {
  margin: 0 !important;
  border-radius: 6px;
  overflow: hidden;
  white-space: pre;
}

.markdown-body pre code.hljs {
  display: block;
  padding: 1.2em 1.5em;
  overflow-x: auto;
}

.copy-code-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  display: inline-flex;
  align-items: center;
  background-color: #3b4048;
  color: #abb2bf;
  border: 1px solid #3b4048;
  border-radius: 4px;
  padding: 4px 8px;
  font-family: sans-serif;
  cursor: pointer;
  opacity: 0;
  transition: opacity .2s ease-in-out, background-color .2s, color .2s;
}

.code-block-wrapper:hover .copy-code-btn {
  opacity: 1;
}

.copy-code-btn:hover {
  background-color: #4f5660;
}

.copy-code-btn.copied {
  background-color: #98c379;
  color: #282c34;
  border-color: #98c379;
}

.markdown-body .katex-display {
  text-align: center;
  margin: 1em 0;
}

.markdown-body .katex {
  font-size: 1.1em;
}

@media (max-width: 860px) {
  .post-title {
    font-size: 30px;
  }
}
</style>
