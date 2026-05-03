import { createRouter, createWebHistory } from 'vue-router'
import { toRouteRecords, createCastGuard } from '../lib/castRoutes'
import { userRoutes } from '../modules/users/routes'
import { companyRoutes } from '../modules/companies/routes'

const allRoutes = [...userRoutes, ...companyRoutes]

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', redirect: '/users' },
    ...toRouteRecords(allRoutes),
  ],
})

router.beforeEach(createCastGuard(allRoutes))
