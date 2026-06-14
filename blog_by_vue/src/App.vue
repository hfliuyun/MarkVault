<script setup>
import PageHeader from './components/PageHeader.vue';

</script>

<template>
  <div class="aurora-bg"></div>
  <div class="app-wrapper">
    <PageHeader />
     
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.app-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.main-content {
  flex-grow: 1;
  width: 100%;
  padding: 100px 20px 60px; /* Top padding to prevent overlap with fixed header */
}
</style>
