<script setup>
import PageHeader from './components/PageHeader.vue';

</script>

<template>
  <div class="aurora-bg"></div>
  <div class="app-wrapper">
    <PageHeader />
     
    <main class="main-content">
      <router-view v-slot="{ Component, route }">
        <transition name="fade-page" mode="out-in">
          <component :is="Component" :key="route.path" />
        </transition>
      </router-view>
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

@media (max-width: 960px) {
  .main-content {
    padding: 88px 0px 40px;
  }
}

/* Page Transition Animations */
.fade-page-enter-active,
.fade-page-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.fade-page-enter-from,
.fade-page-leave-to {
  opacity: 0;
  transform: translateY(15px);
}
</style>
