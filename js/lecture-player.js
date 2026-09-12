/**
 * lecture-player.js - Video Lecture Catalog & Interactive Player
 * Supports external video URLs / unlisted YouTube / Vimeo / iframe embeds.
 */

class LecturePlayer {
  constructor() {
    this.selectedSubject = 'all';
    this.searchQuery = '';
    this.currentLectureId = null;
  }

  renderCatalog() {
    const lectures = window.store.getLectures().filter(l => l.isPublished);
    const subjects = window.store.getSubjects();

    // Render Subject Filter Tabs
    const filterContainer = document.getElementById('lecture-subject-filters');
    if (filterContainer) {
      filterContainer.innerHTML = `
        <button 
          onclick="window.lecturePlayer.filterSubject('all')"
          class="px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
            this.selectedSubject === 'all' 
              ? 'bg-blue-600 text-white shadow-sm' 
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }"
        >
          All Subjects (${lectures.length})
        </button>
        ${subjects.map(s => {
          const count = lectures.filter(l => l.subjectId === s.id).length;
          const isActive = this.selectedSubject === s.id;
          return `
            <button 
              onclick="window.lecturePlayer.filterSubject('${s.id}')"
              class="px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                isActive 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }"
            >
              ${s.name} (${count})
            </button>
          `;
        }).join('')}
      `;
    }

    // Filter lectures
    let filtered = lectures;
    if (this.selectedSubject !== 'all') {
      filtered = filtered.filter(l => l.subjectId === this.selectedSubject);
    }
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(l => l.title.toLowerCase().includes(q) || l.description.toLowerCase().includes(q) || l.chapter.toLowerCase().includes(q));
    }

    const gridContainer = document.getElementById('lecture-grid');
    if (!gridContainer) return;

    if (filtered.length === 0) {
      gridContainer.innerHTML = `
        <div class="col-span-full text-center py-16 bg-white rounded-xl border border-dashed border-slate-200 p-8">
          <i data-lucide="video-off" class="w-10 h-10 text-slate-400 mx-auto mb-3"></i>
          <h4 class="text-base font-bold text-slate-800">No lectures found</h4>
          <p class="text-xs text-slate-500 mt-1">Try selecting another subject or clearing your search filter.</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    gridContainer.innerHTML = filtered.map(lec => {
      const subject = window.store.getSubjectById(lec.subjectId);
      return `
        <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all group flex flex-col justify-between">
          <div class="relative cursor-pointer" onclick="window.lecturePlayer.openLecture('${lec.id}')">
            <img src="${lec.thumbnail}" alt="${lec.title}" class="w-full h-44 object-cover group-hover:scale-105 transition-transform duration-300">
            <div class="absolute inset-0 bg-slate-900/30 group-hover:bg-slate-900/15 transition-colors flex items-center justify-center">
              <div class="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <i data-lucide="play" class="w-6 h-6 fill-white ml-0.5"></i>
              </div>
            </div>
            <div class="absolute bottom-2 left-2">
              <span class="bg-blue-600/90 text-white text-[11px] font-semibold px-2 py-0.5 rounded shadow">
                ${subject ? subject.name : 'CA Lecture'}
              </span>
            </div>
            <span class="absolute bottom-2 right-2 bg-slate-900/80 text-white text-[11px] font-semibold px-2 py-0.5 rounded">
              ${lec.durationMinutes} mins
            </span>
          </div>

          <div class="p-5 flex-1 flex flex-col justify-between">
            <div>
              <span class="text-xs text-slate-500 font-medium">${lec.chapter}</span>
              <h4 class="text-base font-bold text-slate-900 mt-1 mb-2 line-clamp-2">${lec.title}</h4>
              <p class="text-xs text-slate-600 line-clamp-3 mb-4 leading-relaxed">${lec.description}</p>
            </div>

            <div class="pt-3 border-t border-slate-100 flex items-center justify-between">
              <span class="text-xs text-slate-500 flex items-center gap-1">
                <i data-lucide="eye" class="w-3.5 h-3.5 text-slate-400"></i>
                ${lec.views} views
              </span>
              <button 
                onclick="window.lecturePlayer.openLecture('${lec.id}')"
                class="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
              >
                Watch Lecture
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  filterSubject(subjectId) {
    this.selectedSubject = subjectId;
    this.renderCatalog();
  }

  handleSearch(query) {
    this.searchQuery = query;
    this.renderCatalog();
  }

  openLecture(lectureId) {
    const lecture = window.store.getLectures().find(l => l.id === lectureId);
    if (!lecture) return;

    this.currentLectureId = lectureId;
    
    // Increment view counter
    lecture.views = (lecture.views || 0) + 1;
    window.store.updateLecture(lecture);

    const subject = window.store.getSubjectById(lecture.subjectId);
    const relatedLectures = window.store.getLectures()
      .filter(l => l.isPublished && l.id !== lecture.id)
      .slice(0, 4);

    const playerContainer = document.getElementById('lecture-player-view');
    const catalogContainer = document.getElementById('lecture-catalog-view');

    if (catalogContainer) catalogContainer.classList.add('hidden');
    if (playerContainer) {
      playerContainer.classList.remove('hidden');
      playerContainer.innerHTML = `
        <div class="mb-6 flex items-center justify-between">
          <button 
            onclick="window.lecturePlayer.closeLecture()"
            class="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-blue-600 bg-white border border-slate-200 px-3.5 py-2 rounded-lg transition-colors shadow-sm"
          >
            <i data-lucide="arrow-left" class="w-4 h-4"></i>
            Back to Lectures Catalog
          </button>
          <span class="text-xs text-slate-500 font-medium">CA Study Portal • Video Player</span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- Main Player Column (2 Cols) -->
          <div class="lg:col-span-2 space-y-6">
            <!-- 16:9 Responsive Video Frame -->
            <div class="aspect-video-container shadow-xl">
              <iframe 
                src="${lecture.videoUrl}?autoplay=1&rel=0" 
                title="${lecture.title}"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                allowfullscreen
              ></iframe>
            </div>

            <!-- Video Metadata -->
            <div class="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <div class="flex flex-wrap items-center gap-2 mb-3">
                <span class="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                  ${subject ? subject.name : 'General'}
                </span>
                <span class="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-700">
                  ${lecture.chapter}
                </span>
                <span class="text-xs text-slate-500 ml-auto flex items-center gap-1">
                  <i data-lucide="clock" class="w-3.5 h-3.5"></i> ${lecture.durationMinutes} mins
                </span>
                <span class="text-xs text-slate-500 flex items-center gap-1">
                  <i data-lucide="eye" class="w-3.5 h-3.5"></i> ${lecture.views} views
                </span>
              </div>

              <h2 class="text-xl font-bold text-slate-900 mb-3">${lecture.title}</h2>
              <div class="prose prose-sm max-w-none text-slate-700 text-sm leading-relaxed border-t border-slate-100 pt-4">
                <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Lecture Notes & Key Takeaways</h4>
                <p>${lecture.description}</p>
              </div>

              <!-- Action Bar -->
              <div class="mt-6 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                  <button class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                    <i data-lucide="bookmark" class="w-3.5 h-3.5"></i> Save for Revision
                  </button>
                  <button class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                    <i data-lucide="download" class="w-3.5 h-3.5"></i> Companion Notes (PDF)
                  </button>
                </div>
                <span class="text-xs font-medium text-emerald-600 flex items-center gap-1">
                  <i data-lucide="check-circle" class="w-4 h-4"></i> Free CA Curriculum Resource
                </span>
              </div>
            </div>

            <!-- AdSense Compliant Banner Slot (Below Video Player) -->
            <div class="adsense-wrapper p-4 adsense-banner-leaderboard flex flex-col items-center justify-center">
              <span class="adsense-tag mb-1">Sponsored Learning Resource • Ad Placement</span>
              <div class="text-xs text-slate-400 font-medium">Google AdSense Responsive Unit (728x90)</div>
              <div class="text-[11px] text-slate-400 italic">CA Exam Preparation Software & Books</div>
            </div>
          </div>

          <!-- Sidebar Column: Related Lectures -->
          <div class="space-y-6">
            <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <h3 class="text-sm font-bold text-slate-900 mb-4 flex items-center justify-between">
                <span>Related Lectures</span>
                <span class="text-xs font-normal text-slate-500">${relatedLectures.length} available</span>
              </h3>

              <div class="space-y-3">
                ${relatedLectures.map(rel => {
                  const relSub = window.store.getSubjectById(rel.subjectId);
                  return `
                    <div 
                      onclick="window.lecturePlayer.openLecture('${rel.id}')"
                      class="flex gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer border border-transparent hover:border-slate-200 group"
                    >
                      <img src="${rel.thumbnail}" alt="${rel.title}" class="w-20 h-14 object-cover rounded-md flex-shrink-0 group-hover:opacity-90">
                      <div class="flex-1 min-w-0">
                        <span class="text-[10px] font-bold text-blue-600 block uppercase truncate">${relSub ? relSub.name : 'Lecture'}</span>
                        <h5 class="text-xs font-bold text-slate-800 line-clamp-2 mt-0.5 group-hover:text-blue-600">${rel.title}</h5>
                        <span class="text-[11px] text-slate-400 mt-1 block">${rel.durationMinutes} mins</span>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- AdSense Sidebar Banner (300x250 Medium Rectangle) -->
            <div class="adsense-wrapper p-6 adsense-banner-rectangle flex flex-col items-center justify-center mx-auto">
              <span class="adsense-tag mb-2">Advertisement</span>
              <div class="text-xs font-semibold text-slate-500">AdSense Display Unit</div>
              <div class="text-[11px] text-slate-400 mt-1">300 x 250 Medium Rectangle</div>
              <div class="text-[10px] text-slate-400 mt-3 border border-slate-200 px-2 py-1 rounded">CA Test Series Partner</div>
            </div>
          </div>
        </div>
      `;

      if (window.lucide) window.lucide.createIcons();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  closeLecture() {
    this.currentLectureId = null;
    const playerContainer = document.getElementById('lecture-player-view');
    const catalogContainer = document.getElementById('lecture-catalog-view');

    if (playerContainer) {
      playerContainer.classList.add('hidden');
      playerContainer.innerHTML = '';
    }
    if (catalogContainer) {
      catalogContainer.classList.remove('hidden');
    }
    this.renderCatalog();
  }
}

window.lecturePlayer = new LecturePlayer();
