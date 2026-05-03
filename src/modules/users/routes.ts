import { defineRoute } from '../../lib/defineRoute'
import { p } from '../../lib/parsers'

export const userRoutes = [
  defineRoute({
    path: '/users',
    component: () => import('./UsersView.vue'),
    children: [
      defineRoute({
        path: '',
        name: 'users-list',
        component: () => import('./UsersView.vue'),
      }),
      defineRoute({
        path: ':id',
        name: 'user-detail',
        params: { id: p.number },
        props: true,
        component: () => import('./UserDetailView.vue'),
      }),
    ],
  }),
]
