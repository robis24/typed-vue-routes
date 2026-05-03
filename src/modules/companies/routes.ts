import { defineRoute } from '../../lib/defineRoute'
import { p } from '../../lib/parsers'

export const companyRoutes = [
  defineRoute({
    path: '/companies',
    name: 'companies-list',
    query: {
      search: p.string,
      industry: p.string,
    },
    component: () => import('./CompaniesView.vue'),
  }),
]
