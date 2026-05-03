<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();

const goToRandomUser = () => {
  const randomId = Math.floor(Math.random() * 100);
  router.push({ name: "user-detail", params: { id: randomId } });
};
</script>

<template>
  <div>
    <h1>Users List</h1>
    <ul>
      <li>
        <router-link :to="{ name: 'user-detail', params: { id: 1 } }"
          >User 1</router-link
        >
      </li>
      <li>
        <router-link :to="{ name: 'user-detail', params: { id: 2 } }"
          >User 2</router-link
        >
      </li>
    </ul>
    <button @click="goToRandomUser">Go to Random User (Programmatic)</button>
  </div>
</template>
