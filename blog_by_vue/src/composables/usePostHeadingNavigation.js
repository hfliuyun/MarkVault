import { nextTick, ref } from 'vue';

export function usePostHeadingNavigation(route, router) {
  const activeHeadingId = ref('');

  const decodeRouteHash = (hash) => {
    if (!hash) return '';
    try {
      return decodeURIComponent(hash.slice(1));
    } catch (error) {
      return hash.slice(1);
    }
  };

  const scrollToHeading = (headingId, behavior = 'smooth') => {
    const heading = document.getElementById(headingId);
    if (!heading) {
      return;
    }
    activeHeadingId.value = headingId;
    const top = heading.getBoundingClientRect().top + window.scrollY - 84;
    window.scrollTo({ top: Math.max(top, 0), behavior });
  };

  const handleTocClick = async (headingId) => {
    await router.replace({
      name: route.name,
      params: route.params,
      query: route.query,
      hash: `#${headingId}`,
    });
    await nextTick();
    scrollToHeading(headingId);
  };

  return {
    activeHeadingId,
    decodeRouteHash,
    scrollToHeading,
    handleTocClick,
  };
}
