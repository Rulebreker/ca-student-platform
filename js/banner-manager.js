/**
 * banner-manager.js - Centralized "New Updates" Banner & Carousel System
 * Features:
 * - Single image mode: Displays clean static banner
 * - Multi-image mode: Automatic horizontal slider/carousel with pagination dots and navigation arrows
 * - Pause on hover, resume on leave
 * - Visible to all website visitors across the platform
 * - Fully reactive to Admin Panel updates
 */

class BannerManager {
  constructor() {
    this.containerId = 'website-updates-banner-container';
    this.currentIndex = 0;
    this.autoSlideInterval = null;
    this.slideDuration = 4500; // 4.5 seconds per slide
    this.isPaused = false;
  }

  init() {
    this.render();
  }

  getVisibleBanners() {
    return window.store.getBanners().filter(b => b.isVisible !== false);
  }

  render() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    this.stopAutoSlide();
    const banners = this.getVisibleBanners();

    if (banners.length === 0) {
      container.innerHTML = '';
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');

    if (banners.length === 1) {
      // Single Image Mode: Normal static display
      const b = banners[0];
      container.innerHTML = `
        <div class="relative w-full overflow-hidden rounded-2xl shadow-sm border border-slate-200 bg-slate-900 group">
          <div class="relative h-44 sm:h-52 md:h-64 lg:h-72 w-full overflow-hidden">
            <img 
              src="${b.imageUrl}" 
              alt="${b.title}" 
              class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              onerror="this.src='https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1200&auto=format&fit=crop&q=80'"
            >
            <div class="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-900/40 to-transparent flex flex-col justify-end p-5 sm:p-7">
              <div class="flex items-center gap-2 mb-1.5">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-blue-600 text-white shadow-xs">
                  ${b.tag || 'NEW UPDATE'}
                </span>
                <span class="text-[11px] text-blue-200 font-semibold flex items-center gap-1">
                  <i data-lucide="bell" class="w-3 h-3"></i> ExcellenceCA Notification
                </span>
              </div>
              <h3 class="text-base sm:text-xl lg:text-2xl font-black text-white tracking-tight line-clamp-1 sm:line-clamp-2">
                ${b.title}
              </h3>
              ${b.subtitle ? `<p class="text-xs sm:text-sm text-slate-200 mt-1 line-clamp-1 max-w-2xl">${b.subtitle}</p>` : ''}
              ${b.linkUrl ? `
                <div class="mt-3">
                  <a href="${b.linkUrl}" class="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white text-slate-900 hover:bg-blue-50 font-bold text-xs rounded-lg shadow-sm transition-colors">
                    Learn More <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
                  </a>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    // 2 or More Images: Horizontal Slider / Carousel
    this.currentIndex = Math.min(this.currentIndex, banners.length - 1);
    if (this.currentIndex < 0) this.currentIndex = 0;

    container.innerHTML = `
      <div 
        id="banner-carousel-wrapper"
        class="relative w-full overflow-hidden rounded-2xl shadow-sm border border-slate-200 bg-slate-900 select-none group"
        onmouseenter="window.bannerManager.pause()"
        onmouseleave="window.bannerManager.resume()"
      >
        <!-- Horizontal Slider Track -->
        <div 
          id="banner-track" 
          class="flex transition-transform duration-500 ease-out"
          style="transform: translateX(-${this.currentIndex * 100}%);"
        >
          ${banners.map((b, idx) => `
            <div class="w-full flex-shrink-0 relative h-44 sm:h-52 md:h-64 lg:h-72 overflow-hidden">
              <img 
                src="${b.imageUrl}" 
                alt="${b.title}" 
                class="w-full h-full object-cover"
                onerror="this.src='https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1200&auto=format&fit=crop&q=80'"
              >
              <div class="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/40 to-transparent flex flex-col justify-end p-5 sm:p-7">
                <div class="flex items-center gap-2 mb-1.5">
                  <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-blue-600 text-white shadow-xs">
                    ${b.tag || 'NEW UPDATE'}
                  </span>
                  <span class="text-[11px] text-blue-200 font-semibold flex items-center gap-1">
                    <i data-lucide="sparkles" class="w-3 h-3 text-amber-400"></i> Bulletin (${idx + 1}/${banners.length})
                  </span>
                </div>
                <h3 class="text-base sm:text-xl lg:text-2xl font-black text-white tracking-tight line-clamp-1 sm:line-clamp-2">
                  ${b.title}
                </h3>
                ${b.subtitle ? `<p class="text-xs sm:text-sm text-slate-200 mt-1 line-clamp-1 max-w-2xl">${b.subtitle}</p>` : ''}
                ${b.linkUrl ? `
                  <div class="mt-3">
                    <a href="${b.linkUrl}" class="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white text-slate-900 hover:bg-blue-50 font-bold text-xs rounded-lg shadow-sm transition-colors">
                      View Details <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
                    </a>
                  </div>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Previous Button -->
        <button 
          onclick="window.bannerManager.prevSlide()" 
          class="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-xs transition-all opacity-80 group-hover:opacity-100 z-10"
          title="Previous Update"
        >
          <i data-lucide="chevron-left" class="w-5 h-5"></i>
        </button>

        <!-- Next Button -->
        <button 
          onclick="window.bannerManager.nextSlide()" 
          class="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-xs transition-all opacity-80 group-hover:opacity-100 z-10"
          title="Next Update"
        >
          <i data-lucide="chevron-right" class="w-5 h-5"></i>
        </button>

        <!-- Pagination Dots -->
        <div class="absolute bottom-3 right-4 sm:right-6 flex items-center gap-1.5 z-10">
          ${banners.map((_, i) => `
            <button 
              onclick="window.bannerManager.goToSlide(${i})" 
              class="h-1.5 rounded-full transition-all ${
                i === this.currentIndex ? 'w-6 bg-white' : 'w-2 bg-white/40 hover:bg-white/70'
              }"
              title="Slide ${i + 1}"
            ></button>
          `).join('')}
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    this.startAutoSlide();
  }

  updateTrack() {
    const track = document.getElementById('banner-track');
    if (!track) return;
    track.style.transform = `translateX(-${this.currentIndex * 100}%)`;

    // Update dots
    const dotsContainer = track.parentElement ? track.parentElement.querySelector('.bottom-3') : null;
    if (dotsContainer) {
      const dots = dotsContainer.querySelectorAll('button');
      dots.forEach((dot, i) => {
        if (i === this.currentIndex) {
          dot.className = 'h-1.5 rounded-full transition-all w-6 bg-white';
        } else {
          dot.className = 'h-1.5 rounded-full transition-all w-2 bg-white/40 hover:bg-white/70';
        }
      });
    }
  }

  nextSlide() {
    const banners = this.getVisibleBanners();
    if (banners.length <= 1) return;
    this.currentIndex = (this.currentIndex + 1) % banners.length;
    this.updateTrack();
  }

  prevSlide() {
    const banners = this.getVisibleBanners();
    if (banners.length <= 1) return;
    this.currentIndex = (this.currentIndex - 1 + banners.length) % banners.length;
    this.updateTrack();
  }

  goToSlide(index) {
    const banners = this.getVisibleBanners();
    if (index >= 0 && index < banners.length) {
      this.currentIndex = index;
      this.updateTrack();
    }
  }

  startAutoSlide() {
    this.stopAutoSlide();
    const banners = this.getVisibleBanners();
    if (banners.length <= 1) return;

    this.autoSlideInterval = setInterval(() => {
      if (!this.isPaused) {
        this.nextSlide();
      }
    }, this.slideDuration);
  }

  stopAutoSlide() {
    if (this.autoSlideInterval) {
      clearInterval(this.autoSlideInterval);
      this.autoSlideInterval = null;
    }
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
  }
}

window.bannerManager = new BannerManager();
