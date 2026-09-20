/**
 * Blog Interactive Features
 * - Theme Toggle (Dark/Light mode)
 * - Reading Progress Bar
 * - Table of Contents (TOC)
 * - Back to Top Button
 * - Code Copy Button
 * - Image Lightbox
 */

(function() {
    'use strict';

    // ============================================
    // Utility: Debounce
    // ============================================
    function debounce(fn, delay) {
        let timer = null;
        return function(...args) {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    // ============================================
    // Utility: Schedule Idle Task
    // ============================================
    function scheduleIdleTask(fn, timeout = 2000, fallbackDelay = 100) {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(fn, { timeout });
        } else {
            setTimeout(fn, fallbackDelay);
        }
    }

    // ============================================
    // DOM Cache — queried once during init
    // ====================================
    const DOM = {
        themeToggle: null,
        backToTop: null,
        progressBar: null,
        postContent: null,
        tocSidebar: null,
        tocList: null,
        lazyImages: null,       // Cache lazy images
        codeBlocks: null,       // Cache code blocks
        allImages: null         // Cache all images
    };

    function initDOMCache() {
        DOM.themeToggle  = document.querySelector('.theme-toggle');
        DOM.backToTop    = document.querySelector('.back-to-top');
        DOM.progressBar  = document.querySelector('.reading-progress');
        DOM.postContent  = document.querySelector('.post-content');
        DOM.tocSidebar   = document.querySelector('.post-toc-sidebar');
        DOM.tocList      = document.querySelector('#toc-list');
        
        // Cache frequently queried elements
        if (DOM.postContent) {
            DOM.lazyImages = DOM.postContent.querySelectorAll('img[data-src]');
            DOM.codeBlocks = DOM.postContent.querySelectorAll('pre');
            DOM.allImages = DOM.postContent.querySelectorAll('img');
        }
        
        // Use requestIdleCallback for non-critical tasks
        scheduleIdleTask(() => convertHighlightSyntax());
    }
    
    /**
     * Convert Markdown ==highlight== syntax to <mark> tags
     * This allows Typora-style highlighting in Jekyll without plugins
     */
    function convertHighlightSyntax() {
        if (!DOM.postContent) return;
        
        // Fast path: skip if no highlight syntax exists
        if (!DOM.postContent.textContent.includes('==')) return;
        
        const SKIP_TAGS = new Set(['MARK', 'CODE', 'PRE', 'SCRIPT', 'STYLE']);
        
        // Single TreeWalker traverses entire postContent
        const walker = document.createTreeWalker(
            DOM.postContent,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        // Collect all text nodes containing '==' that are not inside excluded tags
        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            if (!node.nodeValue.includes('==')) continue;
            
            // Check if any ancestor is a skip tag
            let skip = false;
            let ancestor = node.parentNode;
            while (ancestor && ancestor !== DOM.postContent) {
                if (SKIP_TAGS.has(ancestor.tagName)) {
                    skip = true;
                    break;
                }
                ancestor = ancestor.parentNode;
            }
            if (!skip) {
                textNodes.push(node);
            }
        }
        
        // Batch process collected text nodes
        textNodes.forEach(textNode => {
            const parent = textNode.parentNode;
            const text = textNode.nodeValue;
            
            // Only replace if pattern exists
            if (!/==[^=]+==/.test(text)) return;
            
            const html = text.replace(
                /==([^=]+)==/g,
                '<mark>$1</mark>'
            );
            
            if (html !== text) {
                const span = document.createElement('span');
                // Use textContent for safe parts to prevent XSS
                const parts = html.split(/(<mark>[^<]+<\/mark>)/g);
                parts.forEach(part => {
                    if (part.startsWith('<mark>')) {
                        const mark = document.createElement('mark');
                        mark.textContent = part.slice(6, -7); // Extract content between tags
                        span.appendChild(mark);
                    } else if (part) {
                        span.appendChild(document.createTextNode(part));
                    }
                });
                parent.replaceChild(span, textNode);
            }
        });
    }

    // ============================================
    // Shared scroll handler (throttled via rAF)
    // ============================================
    const ScrollManager = {
        handlers: [],
        ticking: false,

        init() {
            this._handleScroll = () => {
                if (!this.ticking) {
                    requestAnimationFrame(() => {
                        const scrollY = window.scrollY;
                        this.handlers.forEach(fn => fn(scrollY));
                        this.ticking = false;
                    });
                    this.ticking = true;
                }
            };
            window.addEventListener('scroll', this._handleScroll, { passive: true });
        },

        add(fn) {
            this.handlers.push(fn);
        },

        destroy() {
            if (this._handleScroll) {
                window.removeEventListener('scroll', this._handleScroll);
            }
        }
    };

    // ============================================
    // Theme Toggle (Dark Mode)
    // ============================================
    const ThemeManager = {
        init() {
            this.loadTheme();
            this.bindEvents();
        },

        loadTheme() {
            const savedTheme = localStorage.getItem('theme');
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            
            if (savedTheme) {
                document.documentElement.setAttribute('data-theme', savedTheme);
            } else if (prefersDark) {
                document.documentElement.setAttribute('data-theme', 'dark');
            }
        },

        bindEvents() {
            if (DOM.themeToggle) {
                this._handleToggleClick = () => this.toggle();
                DOM.themeToggle.addEventListener('click', this._handleToggleClick);
            }

            this._handleMediaChange = (e) => {
                if (!localStorage.getItem('theme')) {
                    const newTheme = e.matches ? 'dark' : 'light';
                    document.documentElement.setAttribute('data-theme', newTheme);
                    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: newTheme } }));
                }
            };
            this._mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            this._mediaQuery.addEventListener('change', this._handleMediaChange);
        },

        destroy() {
            if (DOM.themeToggle && this._handleToggleClick) {
                DOM.themeToggle.removeEventListener('click', this._handleToggleClick);
            }
            if (this._mediaQuery && this._handleMediaChange) {
                this._mediaQuery.removeEventListener('change', this._handleMediaChange);
            }
        },

        toggle() {
            const current = document.documentElement.getAttribute('data-theme');
            const newTheme = current === 'dark' ? 'light' : 'dark';
            // Add temporary transition class for smooth theme switch
            document.body.classList.add('theme-transitioning');
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: newTheme } }));
            // Remove transition class after animation completes
            setTimeout(() => document.body.classList.remove('theme-transitioning'), 350);
        }
    };

    // ============================================
    // Reading Progress Bar
    // ============================================
    const ReadingProgress = {
        init() {
            this.progressBar = DOM.progressBar;
            if (!this.progressBar) return;

            this.article = DOM.postContent;
            if (!this.article) return;

            // Cache values that don't change on scroll
            this.cacheLayout();
            this.update(window.scrollY);

            // Debounced resize handler
            this._handleResize = debounce(() => {
                this.cacheLayout();
                this.update(window.scrollY);
            }, 150);
            window.addEventListener('resize', this._handleResize);
        },

        destroy() {
            if (this._handleResize) {
                window.removeEventListener('resize', this._handleResize);
            }
        },

        cacheLayout() {
            if (!this.article) return;
            const articleTop = this.article?.offsetTop ?? 0;
            const articleHeight = this.article?.offsetHeight ?? 0;
            const windowHeight = window.innerHeight;
            this.start = articleTop - windowHeight / 2;
            // 边界保护：确保 total 不为 0，防止除零错误
            this.total = articleHeight > 0 ? articleHeight : 1;
            // Reset cached scrollHeight on resize
            this.cachedScrollHeight = 0;
        },

        update(scrollY) {
            // Use cached scrollHeight to avoid recalculation
            if (!this.cachedScrollHeight) {
                this.cachedScrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            }
            
            if (this.cachedScrollHeight <= 0) {
                this.progressBar.style.width = '0%';
                return;
            }

            const current = Math.max(0, scrollY - this.start);
            let progress = (current / this.total) * 100;
            if (!isFinite(progress) || isNaN(progress)) progress = 0;
            progress = Math.max(0, Math.min(100, progress));

            const rounded = Math.round(progress);
            if (rounded === Math.round(this.lastProgress || 0)) return;
            this.lastProgress = progress;
            this.progressBar.style.width = rounded + '%';
        }
    };

    // ============================================
    // Table of Contents (TOC)
    // ============================================
    const TOC = {
        init() {
            this.container = DOM.tocSidebar;
            this.list = DOM.tocList;
            if (!this.container || !this.list) return;

            this.generateTOC();
            this.bindScrollSpy();
        },

        generateTOC() {
            const article = DOM.postContent;
            if (!article) return;

            const headings = article.querySelectorAll('h1, h2, h3, h4');
            if (!headings || headings.length === 0) {
                this.container.style.display = 'none';
                return;
            }

            if (!this.list) return;

            // Cache heading positions for scroll spy
            this.headingData = [];
            let html = '';
            headings.forEach((heading, index) => {
                const id = heading.id || `heading-${index}`;
                heading.id = id;
                
                const level = heading.tagName.toLowerCase();
                const text = heading.textContent.replace(/^[◆#]\s*/, '').trim();
                
                html += `<li><a href="#${id}" class="toc-${level}">${text}</a></li>`;
                this.headingData.push({ id, el: heading });
            });

            this.list.innerHTML = html;
            this.links = this.list.querySelectorAll('a');
        },

        bindScrollSpy() {
            if (!this.links || this.links.length === 0) return;

            // 预计算标题位置并缓存，避免滚动时读取 offsetTop 触发强制同步布局
            this.cacheHeadingPositions();

            // Debounced resize handler
            this._handleResize = debounce(() => this.cacheHeadingPositions(), 150);
            window.addEventListener('resize', this._handleResize);

            ScrollManager.add((scrollY) => this.updateActiveLink(scrollY));
            this.updateActiveLink(window.scrollY);
        },

        /** 缓存所有标题的 offsetTop，resize 时重新计算 */
        cacheHeadingPositions() {
            this.headingPositions = this.headingData.map(item => item.el.offsetTop);
        },

        destroy() {
            if (this._handleResize) {
                window.removeEventListener('resize', this._handleResize);
            }
        },

        updateActiveLink(scrollY) {
            // Threshold check: skip if scroll position changed less than 20px
            if (this._lastScrollY !== undefined && Math.abs(scrollY - this._lastScrollY) < 5) return;
            this._lastScrollY = scrollY;

            const offset = 100;
            const positions = this.headingPositions;
            if (!positions || positions.length === 0) return;

            // Handle single heading case
            if (positions.length === 1) {
                const isActive = positions[0] - offset <= scrollY;
                this.links.forEach(link => link.classList.remove('active'));
                if (isActive) {
                    this.links[0].classList.add('active');
                }
                return;
            }

            // 二分查找替代线性遍历，提升长文章性能
            let left = 0, right = positions.length - 1;
            let activeIndex = -1;

            while (left <= right) {
                const mid = (left + right) >>> 1;
                if (positions[mid] - offset <= scrollY) {
                    activeIndex = mid;
                    left = mid + 1;
                } else {
                    right = mid - 1;
                }
            }

            this.links.forEach(link => link.classList.remove('active'));
            if (activeIndex !== -1) {
                this.links[activeIndex].classList.add('active');
            }
        }
    };

    // ============================================
    // Back to Top Button
    // ============================================
    const BackToTop = {
        init() {
            this.button = DOM.backToTop;
            if (!this.button) return;

            this.visible = false;
            this.checkVisibility(window.scrollY);
            ScrollManager.add((scrollY) => this.checkVisibility(scrollY));

            // 保存 click handler 引用，以便 destroy 时移除
            this._handleClick = () => this.scrollToTop();
            this.button.addEventListener('click', this._handleClick);
        },

        checkVisibility(scrollY) {
            const shouldShow = scrollY > 300;
            if (shouldShow !== this.visible) {
                this.visible = shouldShow;
                this.button.classList.toggle('visible', shouldShow);
            }
        },

        scrollToTop() {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },

        destroy() {
            if (this.button && this._handleClick) {
                this.button.removeEventListener('click', this._handleClick);
            }
        }
    };

    // ============================================
    // Code Copy Button
    // ============================================
    const CodeCopy = {
        _buttons: [],
        _timeoutMap: new WeakMap(),

        init() {
            // Use cached code blocks
            const codeBlocks = DOM.codeBlocks || [];
            codeBlocks.forEach(block => this.addCopyButton(block));
        },

        addCopyButton(block) {
            if (!block || !block.querySelector('code')) return;
            try {
                block.style.position = 'relative';
                
                const button = document.createElement('button');
                button.className = 'code-copy-btn';
                button.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    <span>Copy</span>
                `;
                
                button.addEventListener('click', () => this.copyCode(block, button));
                block.appendChild(button);
                this._buttons.push({ block, button });
            } catch (err) {
                // Silently fail in production
            }
        },

        destroy() {
            this._buttons.forEach(({ block, button }) => {
                const timeout = this._timeoutMap.get(button);
                if (timeout) {
                    clearTimeout(timeout);
                    this._timeoutMap.delete(button);
                }
                if (button.parentNode === block) {
                    block.removeChild(button);
                }
            });
            this._buttons = [];
        },

        async copyCode(block, button) {
            const code = block.querySelector('code');
            const text = code ? code.textContent : block.textContent;
            const span = button.querySelector('span');
            
            // Clear previous timeout for this button before copying
            if (this._timeoutMap.has(button)) {
                clearTimeout(this._timeoutMap.get(button));
                this._timeoutMap.delete(button);
            }

            try {
                await navigator.clipboard.writeText(text);
                button.classList.add('copied');
                if (span) span.textContent = 'Copied!';
                
                const newTimeout = setTimeout(() => {
                    button.classList.remove('copied');
                    if (span) span.textContent = 'Copy';
                    this._timeoutMap.delete(button);
                }, 2000);
                this._timeoutMap.set(button, newTimeout);
            } catch (err) {
                // Silently fail in production
                if (span) span.textContent = 'Failed';
            }
        }
    };

    // ============================================
    // Image Lightbox
    // ============================================
    const ImageLightbox = {
        init() {
            try {
                // Set lazy loading for all relevant images (post + external)
                const postImages = DOM.allImages || [];
                const extraSelector = '.snake-container img, .avatar-frame';
                const extraImages = document.querySelectorAll(extraSelector);
                const allImages = [...postImages, ...extraImages];

                allImages.forEach(img => {
                    if (!img) return;
                    if (!img.hasAttribute('loading')) {
                        img.setAttribute('loading', 'lazy');
                    }
                });

                // Only create lightbox and bind delegation if post has images
                if (!DOM.postContent || postImages.length === 0) return;

                this.createLightbox();

                // Event delegation: single click listener on post container
                this._handlePostClick = (e) => {
                    const img = e.target.closest('img');
                    if (!img) return;
                    // Ensure the img is a direct descendant of post-content, not from nested UI
                    if (!DOM.postContent.contains(img)) return;
                    const src = img.getAttribute('data-src') || img.src;
                    if (src && !src.startsWith('data:')) {
                        e.preventDefault();
                        this.open(src, img.alt);
                    }
                };
                DOM.postContent.addEventListener('click', this._handlePostClick);
            } catch (err) {
                // Silently fail in production
            }
        },

        createLightbox() {
            this.lightbox = document.createElement('div');
            this.lightbox.className = 'image-lightbox';
            this.lightbox.innerHTML = '<img src="" alt="Enlarged image">';
            document.body.appendChild(this.lightbox);

            this._handleLightboxClick = () => this.close();
            this.lightbox.addEventListener('click', this._handleLightboxClick);
            this._handleKeydown = (e) => {
                if (e.key === 'Escape') this.close();
            };
            document.addEventListener('keydown', this._handleKeydown);
        },

        destroy() {
            // Remove delegated click listener
            if (DOM.postContent && this._handlePostClick) {
                DOM.postContent.removeEventListener('click', this._handlePostClick);
                this._handlePostClick = null;
            }
            if (this.lightbox) {
                if (this._handleLightboxClick) {
                    this.lightbox.removeEventListener('click', this._handleLightboxClick);
                }
                if (document.body.contains(this.lightbox)) {
                    document.body.removeChild(this.lightbox);
                }
                this.lightbox = null;
            }
            if (this._handleKeydown) {
                document.removeEventListener('keydown', this._handleKeydown);
            }
        },

        open(src, altText) {
            const img = this.lightbox.querySelector('img');
            img.src = src;
            img.alt = altText || 'Enlarged image';
            this.lightbox.classList.add('active');
            document.body.style.overflow = 'hidden';
        },

        close() {
            this.lightbox.classList.remove('active');
            document.body.style.overflow = '';
        }
    };

    // ============================================
    // GitHub Alerts (NOTE, TIP, IMPORTANT, WARNING, CAUTION)
    // ============================================
    const GitHubAlerts = {
        ALERT_TYPES: {
            NOTE: {
                icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>',
                label: 'Note'
            },
            TIP: {
                icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"></path></svg>',
                label: 'Tip'
            },
            IMPORTANT: {
                icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>',
                label: 'Important'
            },
            WARNING: {
                icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>',
                label: 'Warning'
            },
            CAUTION: {
                icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>',
                label: 'Caution'
            }
        },

        _processedAlerts: [],
        _initialized: false,

        init() {
            // 防止重复初始化导致 DOM 被多次处理
            if (this._initialized) return;
            this._initialized = true;

            try {
                const content = DOM.postContent;
                if (!content) return;

                const blockquotes = content.querySelectorAll('blockquote');
                blockquotes.forEach(bq => {
                    try {
                        this.processBlockquote(bq);
                    } catch (err) {
                        // Silently fail in production
                    }
                });
            } catch (err) {
                // Silently fail in production
            }
        },

        destroy() {
            this._processedAlerts = [];
            this._initialized = false;
        },

        processBlockquote(bq) {
            const firstP = bq.querySelector('p:first-child');
            if (!firstP) return;

            const text = firstP.textContent.trim();
            const match = text.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/);
            if (!match) return;

            const type = match[1];
            const config = this.ALERT_TYPES[type];
            const typeLower = type.toLowerCase();

            // Create the alert container
            const alert = document.createElement('div');
            alert.className = `markdown-alert markdown-alert-${typeLower}`;

            // Create the title bar
            const titleP = document.createElement('p');
            titleP.className = 'markdown-alert-title';
            titleP.innerHTML = config.icon;
            const labelSpan = document.createElement('span');
            labelSpan.textContent = config.label;
            titleP.appendChild(labelSpan);
            alert.appendChild(titleP);

            // Create body wrapper
            const body = document.createElement('div');
            body.className = 'markdown-alert-body';

            // Process remaining content from the first paragraph
            // Use textContent for user content to prevent XSS
            const remainingText = firstP.textContent.replace(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/, '').trim();
            if (remainingText) {
                const newP = document.createElement('p');
                newP.textContent = remainingText;
                body.appendChild(newP);
            }

            // Move remaining children using DocumentFragment for batch DOM operations
            const fragment = document.createDocumentFragment();
            let sibling = firstP.nextElementSibling;
            while (sibling) {
                const next = sibling.nextElementSibling;
                fragment.appendChild(sibling);
                sibling = next;
            }
            body.appendChild(fragment);

            alert.appendChild(body);

            // Replace blockquote with alert
            bq.parentNode.replaceChild(alert, bq);
        }
    };

    // ============================================
    // Mermaid Diagram Renderer
    // ============================================
    const MermaidRenderer = {
        _initialized: false,
        _originalContent: new Map(),

        _initMermaid() {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            mermaid.initialize({
                startOnLoad: false,
                theme: isDark ? 'dark' : 'default',
                securityLevel: 'loose'
            });
        },

        init() {
            // 防止重复初始化导致 DOM 被多次处理
            if (this._initialized) return;
            this._initialized = true;

            const codeBlocks = DOM.postContent
                ? DOM.postContent.querySelectorAll('pre code.language-mermaid')
                : [];
            if (!codeBlocks.length) return;

            // 如果 mermaid 已加载，直接渲染
            if (typeof mermaid !== 'undefined') {
                this.render(codeBlocks);
            } else {
                // 监听 mermaid 脚本加载完成（事件驱动，替代轮询）
                const mermaidScript = document.querySelector('script[src*="mermaid"]');
                if (mermaidScript) {
                    mermaidScript.addEventListener('load', () => this.render(codeBlocks));
                }
            }

            // 监听主题切换，重新渲染 mermaid 图表
            this._handleThemeChange = (e) => {
                if (typeof mermaid !== 'undefined') {
                    this._rerender();
                }
            };
            document.addEventListener('themechange', this._handleThemeChange);
        },

        render(codeBlocks) {
            if (typeof mermaid === 'undefined') return;

            this._initMermaid();

            // Convert code blocks to mermaid containers
            codeBlocks.forEach((block, index) => {
                const pre = block.parentElement;
                if (!pre || !pre.parentElement) return;
                const container = document.createElement('div');
                container.className = 'mermaid';
                const id = `mermaid-${index}`;
                container.id = id;
                container.textContent = block.textContent;
                this._originalContent.set(id, block.textContent);
                pre.parentElement.replaceChild(container, pre);
            });

            // Render all mermaid diagrams
            mermaid.run();
        },

        _rerender() {
            const mermaidDivs = document.querySelectorAll('.mermaid');
            mermaidDivs.forEach(div => {
                div.removeAttribute('data-processed');
                // 清空已渲染的 SVG
                div.innerHTML = '';
                // 恢复原始 Mermaid 代码文本
                const original = this._originalContent.get(div.id);
                if (original) {
                    div.textContent = original;
                }
            });

            // 用新主题重新初始化并渲染
            this._initMermaid();
            mermaid.run();
        },

        destroy() {
            if (this._handleThemeChange) {
                document.removeEventListener('themechange', this._handleThemeChange);
            }
            this._originalContent.clear();
            this._initialized = false;
        }
    };

    // ============================================
    // Popup Manager (QR Code Modal)
    // ============================================
    const PopupManager = {
        _lastTrigger: null,

        init() {
            // 使用事件委托处理所有弹窗相关点击（合并为单个 click 监听器）
            this._handleClick = (e) => {
                // 处理弹窗打开
                const socialBtn = e.target.closest('.social-btn[data-popup]');
                if (socialBtn) {
                    e.preventDefault();
                    const imgUrl = socialBtn.getAttribute('data-popup');
                    if (imgUrl) {
                        this._lastTrigger = socialBtn;
                        this.show(imgUrl);
                    }
                    return;
                }

                // 处理弹窗关闭
                if (e.target.closest('.popup-close') || e.target.classList.contains('popup-overlay')) {
                    this.close();
                }
            };
            document.addEventListener('click', this._handleClick);

            // ESC键关闭
            this._handleKeydown = (e) => {
                if (e.key === 'Escape') {
                    const popup = document.querySelector('.popup-overlay');
                    if (popup && popup.classList.contains('active')) {
                        this.close();
                    }
                }
            };
            document.addEventListener('keydown', this._handleKeydown);
        },

        show(imgUrl) {
            const popup = document.querySelector('.popup-overlay');
            const img = document.querySelector('.popup-img');
            if (!popup || !img) return;

            img.src = imgUrl;
            popup.classList.add('active');
            popup.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            popup.focus();
        },

        close() {
            const popup = document.querySelector('.popup-overlay');
            if (!popup) return;

            popup.classList.remove('active');
            popup.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';

            // 返回焦点到触发元素
            if (this._lastTrigger) {
                this._lastTrigger.focus();
            } else {
                document.body.focus();
            }
            this._lastTrigger = null;
        },

        destroy() {
            if (this._handleClick) {
                document.removeEventListener('click', this._handleClick);
                this._handleClick = null;
            }
            if (this._handleKeydown) {
                document.removeEventListener('keydown', this._handleKeydown);
                this._handleKeydown = null;
            }
        }
    };

    // ============================================
    // Smooth Scroll for Anchor Links
    // ============================================
    const SmoothScroll = {
        _handler: null,

        init() {
            try {
                this._handler = (e) => {
                    const anchor = e.target.closest('a[href^="#"]');
                    if (!anchor) return;
                    const targetId = anchor.getAttribute('href');
                    if (targetId === '#') return;
                    const target = document.querySelector(targetId);
                    if (target) {
                        e.preventDefault();
                        window.scrollTo({
                            top: target.offsetTop - 80,
                            behavior: 'smooth'
                        });
                    }
                };
                document.addEventListener('click', this._handler);
            } catch (err) {
                // Silently fail in production
            }
        },

        destroy() {
            if (this._handler) {
                document.removeEventListener('click', this._handler);
                this._handler = null;
            }
        }
    };

    // ============================================
    // Expand/Collapse All Categories
    // ============================================
    const ExpandAll = {
        _handler: null,
        _btn: null,

        init() {
            this._btn = document.getElementById('expand-all-btn');
            if (!this._btn) return;

            this._handler = (e) => {
                if (e.target !== this._btn) return;
                
                const items = document.querySelectorAll('.category-list details');
                if (!items.length) return;
                
                const allOpen = Array.from(items).every(d => d.open);
                const newState = !allOpen;
                
                items.forEach(d => d.open = newState);
                this._btn.setAttribute('aria-pressed', String(newState));
                this._btn.setAttribute('aria-expanded', String(newState));
            };
            
            this._btn.addEventListener('click', this._handler);
        },

        destroy() {
            if (this._btn && this._handler) {
                this._btn.removeEventListener('click', this._handler);
            }
        }
    };

    // ============================================
    // Image Lazy Loading with Intersection Observer
    // ============================================
    const LazyImageLoader = {
        _observer: null,

        init() {
            // 单次遍历：同时设置图片尺寸 + 转换懒加载（合并原 setImageDimensions 和 autoConvertToLazyLoading）
            const images = DOM.allImages || [];
            images.forEach((img, index) => {
                // 设置尺寸：为没有 width/height 的图片添加固有尺寸，防止 CLS
                if (!img.hasAttribute('width') && !img.hasAttribute('height')) {
                    if (img.complete && img.naturalWidth > 0) {
                        img.setAttribute('width', img.naturalWidth);
                        img.setAttribute('height', img.naturalHeight);
                    } else if (img.src) {
                        img.addEventListener('load', function() {
                            // 跳过懒加载占位符
                            if (this.src.startsWith('data:')) return;
                            if (!img.hasAttribute('width') || img.getAttribute('width') === '1') {
                                if (this.naturalWidth > 0) {
                                    img.setAttribute('width', this.naturalWidth);
                                    img.setAttribute('height', this.naturalHeight);
                                }
                            }
                        });
                    }
                }

                // 转换懒加载：跳过首图（保留即时加载用于 SEO 和 LCP）
                if (index === 0) return;

                // Skip if already has data-src or is SVG (both URL and data URI)
                if (img.hasAttribute('data-src')) return;
                if (img.src?.endsWith('.svg') || img.src?.startsWith('data:image/svg+xml')) return;

                // Skip small images (icons/spacers): check complete images directly, skip incomplete
                if (img.complete && img.naturalWidth > 0 && img.naturalWidth < 50) return;
                if (img.width && img.width < 50) return;

                // Convert to lazy loading
                const src = img.getAttribute('src');
                if (src && !src.startsWith('data:')) {
                    img.setAttribute('data-src', src);
                    img.removeAttribute('src');
                    // Add a tiny transparent placeholder
                    img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"%3E%3C/svg%3E';
                }
            });

            // Check if Intersection Observer is supported
            if (!('IntersectionObserver' in window)) {
                // Fallback: load all images immediately - re-query DOM after dynamic data-src conversion
                const lazyImages = DOM.postContent ? DOM.postContent.querySelectorAll('img[data-src]') : [];
                lazyImages.forEach(img => {
                    this.loadImage(img);
                });
                return;
            }

            // Create observer with 200px threshold for preloading
            this._observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        this.loadImage(entry.target);
                        this._observer.unobserve(entry.target);
                    }
                });
            }, {
                rootMargin: '200px 0px', // Start loading 200px before entering viewport
                threshold: 0.01
            });

            // Re-query DOM after dynamic data-src conversion
            const lazyImages = DOM.postContent ? DOM.postContent.querySelectorAll('img[data-src]') : [];
            lazyImages.forEach(img => {
                this._observer.observe(img);
            });
        },

        loadImage(img) {
            const src = img.getAttribute('data-src');
            if (!src) return;

            // Add loading class for fade-in effect
            img.classList.add('loading');

            // Create new image to preload
            const tempImg = new Image();
            
            tempImg.onload = () => {
                img.src = src;
                img.removeAttribute('data-src');
                // 更新图片尺寸属性
                img.setAttribute('width', tempImg.naturalWidth);
                img.setAttribute('height', tempImg.naturalHeight);
                img.classList.remove('loading');
                img.classList.add('loaded');
            };

            tempImg.onerror = () => {
                img.classList.remove('loading');
                img.classList.add('error');
            };

            tempImg.src = src;
        },

        destroy() {
            if (this._observer) {
                this._observer.disconnect();
            }
        }
    };

    // ============================================
    // Initialize All Features
    // ============================================
    function init() {
        initDOMCache();
        const modules = [
            { name: 'ScrollManager', mod: ScrollManager },
            { name: 'ThemeManager', mod: ThemeManager },
            { name: 'ReadingProgress', mod: ReadingProgress },
            { name: 'TOC', mod: TOC },
            { name: 'BackToTop', mod: BackToTop },
            { name: 'CodeCopy', mod: CodeCopy },
            { name: 'ImageLightbox', mod: ImageLightbox },
            { name: 'PopupManager', mod: PopupManager },
            { name: 'SmoothScroll', mod: SmoothScroll },
            { name: 'ExpandAll', mod: ExpandAll },
            { name: 'LazyImageLoader', mod: LazyImageLoader }
        ];
        modules.forEach(({ name, mod }) => {
            try {
                mod.init();
            } catch (err) {
                // Silently fail in production
            }
        });

        // 非关键模块延迟初始化
        scheduleIdleTask(() => {
            GitHubAlerts.init();
            MermaidRenderer.init();
        }, 3000);
    }

    function destroyAll() {
        ScrollManager.destroy();
        ThemeManager.destroy();
        ReadingProgress.destroy();
        BackToTop.destroy();
        TOC.destroy();
        CodeCopy.destroy();
        ImageLightbox.destroy();
        MermaidRenderer.destroy();
        GitHubAlerts.destroy();
        PopupManager.destroy();
        SmoothScroll.destroy();
        ExpandAll.destroy();
        LazyImageLoader.destroy();
    }

    window.addEventListener('beforeunload', destroyAll);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
