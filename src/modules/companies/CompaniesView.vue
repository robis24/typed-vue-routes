<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useTypedRoute } from '../../lib/useTypedRoute'

const { query } = useTypedRoute('companies-list')
const router = useRouter()

const searchFinance = () => {
  router.push({
    name: 'companies-list',
    query: { search: 'bank', industry: 'finance' },
  })
}
</script>

<template>
  <div>
    <h1>Companies List</h1>
    <div class="filters">
      <p>Current Search: {{ query.search || 'None' }}</p>
      <p>Current Industry: {{ query.industry || 'All' }}</p>

      <router-link
        :to="{
          name: 'companies-list',
          query: { search: 'google', industry: 'tech' },
        }"
      >
        Search Tech
      </router-link>
      |
      <router-link :to="{ name: 'companies-list', query: {} }">
        Clear Filters
      </router-link>
      <br /><br />
      <button @click="searchFinance">Search Finance (Programmatic)</button>
    </div>
  </div>
</template>
