import { createRouter, createWebHashHistory } from "vue-router";

const routes = [
  {
    path: "/",
    name: "Home",
    component: () => import("@/views/Home.vue"),
  },
  {
    path: "/about",
    name: "About",
    component: () => import("@/views/About.vue"),
  },
  {
    path: "/posts/:slug",
    name: "PostDetail",
    component: () => import("@/views/Post.vue"),
  },
  {
    path: "/p/:abbrlink",
    name: "LegacyPostDetail",
    component: () => import("@/views/Post.vue"),
  },
  {
    path: "/series",
    name: "SeriesList",
    component: () => import("@/views/SeriesList.vue"),
  },
  {
    path: "/series/:seriesId",
    name: "SeriesDetail",
    component: () => import("@/views/SeriesDetail.vue"),
  },
  {
    path: "/categories",
    name: "CategoryList",
    component: () => import("@/views/CategoryList.vue"),
  },
  {
    path: "/categories/:category",
    name: "CategoryDetail",
    component: () => import("@/views/CategoryDetail.vue"),
  },
  {
    path: "/tags",
    name: "TagList",
    component: () => import("@/views/TagList.vue"),
  },
  {
    path: "/tags/:tag",
    name: "TagDetail",
    component: () => import("@/views/TagDetail.vue"),
  },
  {
    path:"/write",
    name:"Write",
    component:()=>import("@/views/Edit.vue")
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
