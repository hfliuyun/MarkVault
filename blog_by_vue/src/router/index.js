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
    component: () => import("@/views/LegacyRedirect.vue"),
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
    path: "/search",
    name: "Search",
    component: () => import("@/views/Search.vue"),
  },
  {
    path: "/paste",
    name: "PasteHome",
    component: () => import("@/views/PasteHome.vue"),
  },
  {
    path: "/paste/:id",
    name: "PasteView",
    component: () => import("@/views/PasteView.vue"),
  },
  {
    path: "/manage",
    name: "Manage",
    component: () => import("@/views/ManagePosts.vue"),
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }
    // Ignore hash changes on the same page (handled manually by TOC)
    if (to.path === from.path) {
      return false;
    }
    // Wait for the fade-out transition to complete (0.25s) before scrolling to top
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ top: 0 });
      }, 250);
    });
  }
});

export default router;
