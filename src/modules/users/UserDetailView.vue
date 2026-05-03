<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";

const route = useRoute("user-detail");
const router = useRouter();

const goBack = () => {
  router.push({ name: "users-list" });
};
</script>

<template>
  <div>
    <h1>User Detail</h1>
    <p>User ID: {{ route.params.id }}</p>
    <button @click="goBack">Back to List (Programmatic)</button>
  </div>
</template>
