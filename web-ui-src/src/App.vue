<template>
  <!-- :data-theme="theme ? 'forest' : 'emerald'" -->
  <div class="bg-base-300 absolute w-full top-0">
    <Toaster position="top-right" />
    <router-view></router-view>
    <Footer />
    <Settings />
  </div>
</template>

<script setup>
import { onBeforeMount, onMounted, onUnmounted } from 'vue'
import Footer from './components/Footer.vue'
import Settings from './components/Settings.vue'
import { useBinaryThemeManager } from './model/theme'
import { initializeConnectionMonitoring, stopHealthChecks } from './model/connection'

const themeMgr = useBinaryThemeManager()
onBeforeMount(() => {
  themeMgr.setLightAlias('emerald')
  themeMgr.setDarkAlias('forest')
})

onMounted(() => {
  initializeConnectionMonitoring()
})

onUnmounted(() => {
  stopHealthChecks()
})
</script>

<style></style>
