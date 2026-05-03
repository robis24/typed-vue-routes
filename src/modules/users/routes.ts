import { defineRoute } from '../../lib/defineRoute'
import { p } from '../../lib/parsers'

export const userRoutes = [
  defineRoute({
    path: '/users',
    name: 'users-list',
    component: () => import('./UsersView.vue'),
  }),
  defineRoute({
    path: '/users/:id',
    name: 'user-detail',
    params: { id: p.number },
    props: true,
    component: () => import('./UserDetailView.vue'),
  }),
]
