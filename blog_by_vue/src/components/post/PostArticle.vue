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
  margin: 0 0 16px;
  color: var(--blog-text);
  font-size: 40px;
  line-height: 1.25;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.markdown-body {
  font-family: var(--blog-font);
  line-height: 1.8;
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
  font-weight: 600;
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
  text-decoration: none;
}

.markdown-body a:hover {
  text-decoration: underline;
}

.markdown-body blockquote {
  margin: 1.6em 0;
  padding: 4px 0 4px 20px;
  color: var(--blog-muted);
  border-left: 4px solid var(--blog-accent);
  background: rgba(120, 120, 120, 0.05);
  border-radius: 0 8px 8px 0;
}

.markdown-body table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.6em 0;
  display: block;
  overflow-x: auto;
}

.markdown-body th,
.markdown-body td {
  padding: 10px 14px;
  border: 1px solid var(--blog-border);
}

.markdown-body th {
  background: rgba(120, 120, 120, 0.05);
}

.markdown-body img {
  max-width: 100%;
  height: auto;
  border-radius: 12px;
  box-shadow: var(--glass-shadow);
  margin: 1.2em 0;
}

/* macOS Code Window Style */
.code-block-wrapper {
  position: relative;
  margin: 1.6em 0;
  border-radius: 12px;
  background-color: rgba(30, 30, 32, 0.85);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  padding-top: 38px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

[data-theme='dark'] .code-block-wrapper {
  background-color: rgba(20, 20, 22, 0.85);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.code-block-wrapper::before {
  content: '';
  position: absolute;
  top: 14px;
  left: 16px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #ff5f56;
  box-shadow: 20px 0 0 #ffbd2e, 40px 0 0 #27c93f;
  z-index: 2;
}

.markdown-body pre {
  margin: 0 !important;
  border-radius: 0 0 12px 12px;
  overflow: hidden;
  white-space: pre;
  background: transparent !important;
}

.markdown-body pre code.hljs {
  display: block;
  padding: 0 1.5em 1.5em;
  overflow-x: auto;
  background: transparent !important; /* Ensure highlight.js bg doesn't override */
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 14px;
  line-height: 1.6;
}

.copy-code-btn {
  position: absolute;
  top: 8px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  background-color: rgba(255,255,255,0.1);
  color: #abb2bf;
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 6px;
  padding: 4px 10px;
  font-family: var(--blog-font);
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition: all .2s ease-in-out;
}

.code-block-wrapper:hover .copy-code-btn {
  opacity: 1;
}

.copy-code-btn:hover {
  background-color: rgba(255,255,255,0.2);
  color: #fff;
}

.copy-code-btn.copied {
  background-color: #27c93f;
  color: #fff;
  border-color: #27c93f;
}

.markdown-body .katex-display {
  text-align: center;
  margin: 1.2em 0;
}

.markdown-body .katex {
  font-size: 1.1em;
}

@media (max-width: 860px) {
  .post-title {
    font-size: 32px;
  }
}
</style>
