<script setup>
defineProps({
  toc: {
    type: Array,
    default: () => [],
  },
  activeHeadingId: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['toc-click']);
</script>

<template>
  <nav class="toc-list">
    <button
      v-for="item in toc"
      :key="item.id"
      type="button"
      :class="[`level-${item.level}`, { active: activeHeadingId === item.id }]"
      @click="emit('toc-click', item.id)"
    >
      {{ item.title }}
    </button>
  </nav>
</template>

<style>
.toc-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.toc-list button {
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--blog-subtle);
  font-size: 14px;
  line-height: 1.45;
  text-align: left;
  cursor: pointer;
}

.toc-list button.active,
.toc-list button:hover {
  color: var(--blog-accent);
}

.toc-list .level-3 {
  padding-left: 12px;
}

.toc-list .level-4,
.toc-list .level-5,
.toc-list .level-6 {
  padding-left: 24px;
}
</style>
