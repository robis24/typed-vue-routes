<script setup lang="ts">
</script>

<template>
  <nav>
    <router-link to="/users">Users</router-link> |
    <router-link to="/companies">Companies</router-link>
  </nav>
  <main>
    <router-view />
  </main>
</template>

<style scoped>
nav {
  padding: 1rem;
  border-bottom: 1px solid #ccc;
  margin-bottom: 1rem;
}
nav a {
  margin: 0 0.5rem;
  text-decoration: none;
  color: #42b883;
}
nav a.router-link-active {
  font-weight: bold;
  text-decoration: underline;
}
</style>
