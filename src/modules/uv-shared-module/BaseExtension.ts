import {Auth09} from "./Auth09";
import {Auth1} from "./Auth1";
import {BaseEvents} from "./BaseEvents";
import {ClickThroughDialogue} from "../../modules/uv-dialogues-module/ClickThroughDialogue";
import {IExtension} from "./IExtension";
import {ILocale} from "../../ILocale";
import {ISharePreview} from "./ISharePreview";
import {IUVComponent} from "../../IUVComponent";
import {IUVData} from "../../IUVData";
import {LoginDialogue} from "../../modules/uv-dialogues-module/LoginDialogue";
import {Metric} from "../../modules/uv-shared-module/Metric";
import {MetricType} from "../../modules/uv-shared-module/MetricType";
import {RestrictedDialogue} from "../../modules/uv-dialogues-module/RestrictedDialogue";
import {Shell} from "./Shell";
import {SynchronousRequire} from "../../SynchronousRequire";
import ExternalResource = Manifold.ExternalResource;
import IThumb = Manifold.IThumb;

export class BaseExtension implements IExtension {

    $clickThroughDialogue: JQuery;
    $element: JQuery;
    $loginDialogue: JQuery;
    $restrictedDialogue: JQuery;
    clickThroughDialogue: ClickThroughDialogue;
    component: IUVComponent;
    data: IUVData;
    extensions: any;
    helper: Manifold.IHelper;
    isCreated: boolean = false;
    isLoggedIn: boolean = false;
    lastCanvasIndex: number;
    loginDialogue: LoginDialogue;
    metric: MetricType = MetricType.LAPTOP;
    metrics: Metric[] = [];
    mouseX: number;
    mouseY: number;
    name: string;
    resources: Manifold.ExternalResource[];
    restrictedDialogue: RestrictedDialogue;
    shell: Shell;
    shifted: boolean = false;
    tabbing: boolean = false;

    public create(): void {

        const that = this;

        this.$element = $(this.component.options.target);
        this.$element.data("component", this.component);

        this.fire(BaseEvents.CREATE, {
            data: this.data,
            settings: this.getSettings(),
            preview: this.getSharePreview()
        });

        this._parseMetrics();
        this._initLocales();

        // add/remove classes.
        this.$element.empty();
        this.$element.removeClass();
        this.$element.addClass('uv');
        this.$element.addClass(this.data.locales[0].name.toLowerCase());
        this.$element.addClass(this.name);
        this.$element.addClass('browser-' + window.browserDetect.browser);
        this.$element.addClass('browser-version-' + window.browserDetect.version);
        this.$element.prop('tabindex', 0);
        if (!this.data.isHomeDomain) this.$element.addClass('embedded');
        if (this.data.isLightbox) this.$element.addClass('lightbox');

        this.$element.on('mousemove', (e) => {
            this.mouseX = e.pageX;
            this.mouseY = e.pageY;
        });

        // events
        if (!this.data.isReload) {

            const visibilityProp: string | null = Utils.Documents.getHiddenProp();

            if (visibilityProp) {
                const event: string = visibilityProp.replace(/[H|h]idden/,'') + 'visibilitychange';
                document.addEventListener(event, () => {
                    // resize after a tab has been shown (fixes safari layout issue)
                    if (!Utils.Documents.isHidden()){
                        this.resize();
                    }
                });
            }

            if (Utils.Bools.getBool(this.data.config.options.dropEnabled, true)) {
                this.$element.on('drop', (e => {
                    e.preventDefault();
                    const dropUrl: any = (<any>e.originalEvent).dataTransfer.getData('URL');
                    const a: HTMLAnchorElement = Utils.Urls.getUrlParts(dropUrl);
                    const iiifResourceUri: string | null = Utils.Urls.getQuerystringParameterFromString('manifest', a.search);
                    //var canvasUri = Utils.Urls.getQuerystringParameterFromString('canvas', url.search);

                    if (iiifResourceUri) {
                        this.fire(BaseEvents.DROP, iiifResourceUri);
                        const data: IUVData = <IUVData>{};
                        data.iiifResourceUri = iiifResourceUri;
                        this.reload(data);
                    }
                }));
            }

            this.$element.on('dragover', (e => {
                // allow drop
                e.preventDefault();
            }));

            // keyboard events.

            this.$element.on('keyup keydown', (e: any) => {
                this.shifted = e.shiftKey;
                this.tabbing = e.keyCode === KeyCodes.KeyDown.Tab;
            });

            this.$element.on('keydown', (e: any) => {

                let event: string | null = null;
                let preventDefault: boolean = true;

                if (!e.ctrlKey && !e.altKey && !e.shiftKey) {
                    if (e.keyCode === KeyCodes.KeyDown.Enter) {
                        event = BaseEvents.RETURN;
                        preventDefault = false;
                    }
                    if (e.keyCode === KeyCodes.KeyDown.Escape) event = BaseEvents.ESCAPE;
                    if (e.keyCode === KeyCodes.KeyDown.PageUp) event = BaseEvents.PAGE_UP;
                    if (e.keyCode === KeyCodes.KeyDown.PageDown) event = BaseEvents.PAGE_DOWN;
                    if (e.keyCode === KeyCodes.KeyDown.End) event = BaseEvents.END;
                    if (e.keyCode === KeyCodes.KeyDown.Home) event = BaseEvents.HOME;
                    if (e.keyCode === KeyCodes.KeyDown.NumpadPlus || e.keyCode === 171 || e.keyCode === KeyCodes.KeyDown.Equals) {
                        event = BaseEvents.PLUS;
                        preventDefault = false;  
                    } 
                    if (e.keyCode === KeyCodes.KeyDown.NumpadMinus || e.keyCode === 173 || e.keyCode === KeyCodes.KeyDown.Dash) {
                        event = BaseEvents.MINUS;
                        preventDefault = false;
                    } 

                    if (that.useArrowKeysToNavigate()) {
                        if (e.keyCode === KeyCodes.KeyDown.LeftArrow) event = BaseEvents.LEFT_ARROW;
                        if (e.keyCode === KeyCodes.KeyDown.UpArrow) event = BaseEvents.UP_ARROW;
                        if (e.keyCode === KeyCodes.KeyDown.RightArrow) event = BaseEvents.RIGHT_ARROW;
                        if (e.keyCode === KeyCodes.KeyDown.DownArrow) event = BaseEvents.DOWN_ARROW;
                    }
                }

                if (event) {
                    if (preventDefault) {
                        e.preventDefault();
                    }
                    $.publish(event);
                }
            });

            if (this.data.isHomeDomain) {

                $.subscribe(BaseEvents.EXIT_FULLSCREEN, () => {
                    if (this.isOverlayActive()) {
                        $.publish(BaseEvents.ESCAPE);
                    }

                    $.publish(BaseEvents.ESCAPE);
                    $.publish(BaseEvents.RESIZE);
                });
            }
        }

        this.$element.append('<a href="/" id="top"></a>');
        this.$element.append('<iframe id="commsFrame" style="display:none"></iframe>');

        $.subscribe(BaseEvents.ACCEPT_TERMS, () => {
            this.fire(BaseEvents.ACCEPT_TERMS);
        });

        $.subscribe(BaseEvents.LOGIN_FAILED, () => {
            this.fire(BaseEvents.LOGIN_FAILED);
            this.showMessage(this.data.config.content.authorisationFailedMessage);
        });

        $.subscribe(BaseEvents.LOGIN, () => {
            this.isLoggedIn = true;
            this.fire(BaseEvents.LOGIN);
        });

        $.subscribe(BaseEvents.LOGOUT, () => {
            this.isLoggedIn = false;
            this.fire(BaseEvents.LOGOUT);
        });

        $.subscribe(BaseEvents.BOOKMARK, () => {
            this.bookmark();
            this.fire(BaseEvents.BOOKMARK);
        });

        $.subscribe(BaseEvents.CANVAS_INDEX_CHANGE_FAILED, () => {
            this.fire(BaseEvents.CANVAS_INDEX_CHANGE_FAILED);
        });

        $.subscribe(BaseEvents.CANVAS_INDEX_CHANGED, (e: any, canvasIndex: number) => {
            this.fire(BaseEvents.CANVAS_INDEX_CHANGED, canvasIndex);
        });

        $.subscribe(BaseEvents.CLICKTHROUGH, () => {
            this.fire(BaseEvents.CLICKTHROUGH);
        });

        $.subscribe(BaseEvents.CLOSE_ACTIVE_DIALOGUE, () => {
            this.fire(BaseEvents.CLOSE_ACTIVE_DIALOGUE);
        });

        $.subscribe(BaseEvents.CLOSE_LEFT_PANEL, () => {
            this.fire(BaseEvents.CLOSE_LEFT_PANEL);
            this.resize();
        });

        $.subscribe(BaseEvents.CLOSE_RIGHT_PANEL, () => {
            this.fire(BaseEvents.CLOSE_RIGHT_PANEL);
            this.resize();
        });

        $.subscribe(BaseEvents.COLLECTION_INDEX_CHANGED, (e: any, collectionIndex: number) => {
            this.fire(BaseEvents.COLLECTION_INDEX_CHANGED, collectionIndex);
        });

        $.subscribe(BaseEvents.CREATED, () => {
            this.isCreated = true;
            this.fire(BaseEvents.CREATED);
        });

        $.subscribe(BaseEvents.DOWN_ARROW, () => {
            this.fire(BaseEvents.DOWN_ARROW);
        });

        $.subscribe(BaseEvents.DOWNLOAD, (e: any, obj: any) => {
            this.fire(BaseEvents.DOWNLOAD, obj);
        });

        $.subscribe(BaseEvents.END, () => {
            this.fire(BaseEvents.END);
        });

        $.subscribe(BaseEvents.ESCAPE, () => {
            this.fire(BaseEvents.ESCAPE);

            if (this.isFullScreen() && !this.isOverlayActive()) {
                $.publish(BaseEvents.TOGGLE_FULLSCREEN);
            }
        });

        $.subscribe(BaseEvents.EXTERNAL_LINK_CLICKED, (e: any, url: string) => {
            this.fire(BaseEvents.EXTERNAL_LINK_CLICKED, url);
        });

        $.subscribe(BaseEvents.FEEDBACK, () => {
            this.feedback();
        });

        $.subscribe(BaseEvents.FORBIDDEN, () => {
            this.fire(BaseEvents.FORBIDDEN);
            $.publish(BaseEvents.OPEN_EXTERNAL_RESOURCE);
        });

        $.subscribe(BaseEvents.HIDE_DOWNLOAD_DIALOGUE, () => {
            this.fire(BaseEvents.HIDE_DOWNLOAD_DIALOGUE);
        });

        $.subscribe(BaseEvents.HIDE_EMBED_DIALOGUE, () => {
            this.fire(BaseEvents.HIDE_EMBED_DIALOGUE);
        });

        $.subscribe(BaseEvents.HIDE_EXTERNALCONTENT_DIALOGUE, () => {
            this.fire(BaseEvents.HIDE_EXTERNALCONTENT_DIALOGUE);
        });

        $.subscribe(BaseEvents.HIDE_GENERIC_DIALOGUE, () => {
            this.fire(BaseEvents.HIDE_GENERIC_DIALOGUE);
        });

        $.subscribe(BaseEvents.HIDE_HELP_DIALOGUE, () => {
            this.fire(BaseEvents.HIDE_HELP_DIALOGUE);
        });

        $.subscribe(BaseEvents.HIDE_INFORMATION, () => {
            this.fire(BaseEvents.HIDE_INFORMATION);
        });

        $.subscribe(BaseEvents.HIDE_LOGIN_DIALOGUE, () => {
            this.fire(BaseEvents.HIDE_LOGIN_DIALOGUE);
        });

        $.subscribe(BaseEvents.HIDE_OVERLAY, () => {
            this.fire(BaseEvents.HIDE_OVERLAY);
        });

        $.subscribe(BaseEvents.HIDE_RESTRICTED_DIALOGUE, () => {
            this.fire(BaseEvents.HIDE_RESTRICTED_DIALOGUE);
        });

        $.subscribe(BaseEvents.HIDE_SETTINGS_DIALOGUE, () => {
            this.fire(BaseEvents.HIDE_SETTINGS_DIALOGUE);
        });

        $.subscribe(BaseEvents.HOME, () => {
            this.fire(BaseEvents.HOME);
        });

        $.subscribe(BaseEvents.LEFT_ARROW, () => {
            this.fire(BaseEvents.LEFT_ARROW);
        });

        $.subscribe(BaseEvents.LEFTPANEL_COLLAPSE_FULL_FINISH, () => {
            this.fire(BaseEvents.LEFTPANEL_COLLAPSE_FULL_FINISH);
        });

        $.subscribe(BaseEvents.LEFTPANEL_COLLAPSE_FULL_START, () => {
            this.fire(BaseEvents.LEFTPANEL_COLLAPSE_FULL_START);
        });

        $.subscribe(BaseEvents.LEFTPANEL_EXPAND_FULL_FINISH, () => {
            this.fire(BaseEvents.LEFTPANEL_EXPAND_FULL_FINISH);
        });

        $.subscribe(BaseEvents.LEFTPANEL_EXPAND_FULL_START, () => {
            this.fire(BaseEvents.LEFTPANEL_EXPAND_FULL_START);
        });

        $.subscribe(BaseEvents.LOAD_FAILED, () => {
            this.fire(BaseEvents.LOAD_FAILED);

            if (!that.lastCanvasIndex == null && that.lastCanvasIndex !== that.helper.canvasIndex){
                $.publish(BaseEvents.CANVAS_INDEX_CHANGED, [that.lastCanvasIndex]);
            }
        });

        $.subscribe(BaseEvents.MANIFEST_INDEX_CHANGED, (e: any, manifestIndex: number) => {
            this.fire(BaseEvents.MANIFEST_INDEX_CHANGED, manifestIndex);
        });

        $.subscribe(BaseEvents.NOT_FOUND, () => {
            this.fire(BaseEvents.NOT_FOUND);
        });

        $.subscribe(BaseEvents.OPEN, () => {
            this.fire(BaseEvents.OPEN);

            const openUri: string = String.format(this.data.config.options.openTemplate, this.helper.iiifResourceUri);

            window.open(openUri);
        });

        $.subscribe(BaseEvents.OPEN_LEFT_PANEL, () => {
            this.fire(BaseEvents.OPEN_LEFT_PANEL);
            this.resize();
        });

        $.subscribe(BaseEvents.OPEN_EXTERNAL_RESOURCE, () => {
            this.fire(BaseEvents.OPEN_EXTERNAL_RESOURCE);
        });

        $.subscribe(BaseEvents.OPEN_RIGHT_PANEL, () => {
            this.fire(BaseEvents.OPEN_RIGHT_PANEL);
            this.resize();
        });

        $.subscribe(BaseEvents.PAGE_DOWN, () => {
            this.fire(BaseEvents.PAGE_DOWN);
        });

        $.subscribe(BaseEvents.PAGE_UP, () => {
            this.fire(BaseEvents.PAGE_UP);
        });

        $.subscribe(BaseEvents.RESOURCE_DEGRADED, (e: any, resource: ExternalResource) => {
            this.fire(BaseEvents.RESOURCE_DEGRADED);
            Auth09.handleDegraded(resource)
        });

        $.subscribe(BaseEvents.RETURN, () => {
            this.fire(BaseEvents.RETURN);
        });

        $.subscribe(BaseEvents.RIGHT_ARROW, () => {
            this.fire(BaseEvents.RIGHT_ARROW);
        });

        $.subscribe(BaseEvents.RIGHTPANEL_COLLAPSE_FULL_FINISH, () => {
            this.fire(BaseEvents.RIGHTPANEL_COLLAPSE_FULL_FINISH);
        });

        $.subscribe(BaseEvents.RIGHTPANEL_COLLAPSE_FULL_START, () => {
            this.fire(BaseEvents.RIGHTPANEL_COLLAPSE_FULL_START);
        });

        $.subscribe(BaseEvents.RIGHTPANEL_EXPAND_FULL_FINISH, () => {
            this.fire(BaseEvents.RIGHTPANEL_EXPAND_FULL_FINISH);
        });

        $.subscribe(BaseEvents.RIGHTPANEL_EXPAND_FULL_START, () => {
            this.fire(BaseEvents.RIGHTPANEL_EXPAND_FULL_START);
        });

        $.subscribe(BaseEvents.SEQUENCE_INDEX_CHANGED, (e: any, sequenceIndex: number) => {
            this.fire(BaseEvents.SEQUENCE_INDEX_CHANGED, sequenceIndex);
        });

        $.subscribe(BaseEvents.SETTINGS_CHANGED, (e: any, args: any) => {
            this.fire(BaseEvents.SETTINGS_CHANGED, args);
        });

        $.subscribe(BaseEvents.SHOW_DOWNLOAD_DIALOGUE, () => {
            this.fire(BaseEvents.SHOW_DOWNLOAD_DIALOGUE);
        });

        $.subscribe(BaseEvents.SHOW_EMBED_DIALOGUE, () => {
            this.fire(BaseEvents.SHOW_EMBED_DIALOGUE);
        });

        $.subscribe(BaseEvents.SHOW_EXTERNALCONTENT_DIALOGUE, () => {
            this.fire(BaseEvents.SHOW_EXTERNALCONTENT_DIALOGUE);
        });

        $.subscribe(BaseEvents.SHOW_GENERIC_DIALOGUE, () => {
            this.fire(BaseEvents.SHOW_GENERIC_DIALOGUE);
        });

        $.subscribe(BaseEvents.SHOW_HELP_DIALOGUE, () => {
            this.fire(BaseEvents.SHOW_HELP_DIALOGUE);
        });

        $.subscribe(BaseEvents.SHOW_INFORMATION, () => {
            this.fire(BaseEvents.SHOW_INFORMATION);
        });

        $.subscribe(BaseEvents.SHOW_LOGIN_DIALOGUE, () => {
            this.fire(BaseEvents.SHOW_LOGIN_DIALOGUE);
        });

        $.subscribe(BaseEvents.SHOW_CLICKTHROUGH_DIALOGUE, () => {
            this.fire(BaseEvents.SHOW_CLICKTHROUGH_DIALOGUE);
        });

        $.subscribe(BaseEvents.SHOW_MESSAGE, (e: any, message: string) => {
            this.showMessage(message);
        });

        $.subscribe(BaseEvents.SHOW_RESTRICTED_DIALOGUE, () => {
            this.fire(BaseEvents.SHOW_RESTRICTED_DIALOGUE);
        });

        $.subscribe(BaseEvents.SHOW_OVERLAY, () => {
            this.fire(BaseEvents.SHOW_OVERLAY);
        });

        $.subscribe(BaseEvents.SHOW_SETTINGS_DIALOGUE, () => {
            this.fire(BaseEvents.SHOW_SETTINGS_DIALOGUE);
        });

        $.subscribe(BaseEvents.SHOW_TERMS_OF_USE, () => {
            this.fire(BaseEvents.SHOW_TERMS_OF_USE);
            
            // todo: Eventually this should be replaced with a suitable IIIF Presentation API field - until then, use attribution
            const terms: string = this.helper.getAttribution();

            this.showMessage(terms);
        });

        $.subscribe(BaseEvents.THUMB_SELECTED, (e: any, thumb: IThumb) => {
            this.fire(BaseEvents.THUMB_SELECTED, thumb.index);
        });

        $.subscribe(BaseEvents.TOGGLE_FULLSCREEN, () => {
            $('#top').focus();
            this.component.isFullScreen = !this.component.isFullScreen;

            this.fire(BaseEvents.TOGGLE_FULLSCREEN,
                {
                    isFullScreen: this.component.isFullScreen,
                    overrideFullScreen: this.data.config.options.overrideFullScreen
                });
        });

        $.subscribe(BaseEvents.UP_ARROW, () => {
            this.fire(BaseEvents.UP_ARROW);
        });

        $.subscribe(BaseEvents.UPDATE_SETTINGS, () => {
            this.fire(BaseEvents.UPDATE_SETTINGS);
        });

        $.subscribe(BaseEvents.VIEW_FULL_TERMS, () => {
            this.fire(BaseEvents.VIEW_FULL_TERMS);
        });

        $.subscribe(BaseEvents.WINDOW_UNLOAD, () => {
            this.fire(BaseEvents.WINDOW_UNLOAD);
        });

        // create shell and shared views.
        this.shell = new Shell(this.$element);

        // dependencies
        this.getDependencies((deps: any) => {
            this.loadDependencies(deps);
        });
    }

    createModules(): void {
        this.$clickThroughDialogue = $('<div class="overlay clickthrough"></div>');
        Shell.$overlays.append(this.$clickThroughDialogue);
        this.clickThroughDialogue = new ClickThroughDialogue(this.$clickThroughDialogue);

        this.$restrictedDialogue = $('<div class="overlay login"></div>');
        Shell.$overlays.append(this.$restrictedDialogue);
        this.restrictedDialogue = new RestrictedDialogue(this.$restrictedDialogue);

        this.$loginDialogue = $('<div class="overlay login"></div>');
        Shell.$overlays.append(this.$loginDialogue);
        this.loginDialogue = new LoginDialogue(this.$loginDialogue);
    }

    modulesCreated(): void {

    }

    getDependencies(cb: (deps: any) => void): any {
        const that = this;

        const depsUri: string = this.data.root + '/lib/' + this.name + '-dependencies';

        // check if the deps are already loaded
        const scripts: JQuery = $('script[data-requiremodule]')
            .filter(function() {
                const attr: string = $(this).attr('data-requiremodule');
                return (attr.indexOf(that.name) !== -1 && attr.indexOf('dependencies') !== -1)
            });

        if (!scripts.length) {

            requirejs([depsUri], function(deps: any) {

                const baseUri: string = that.data.root + '/lib/';

                // for each dependency, prepend baseUri.
                if (deps.sync) {                    
                    for (let i = 0; i < deps.sync.length; i++) {
                        deps.sync[i] = baseUri + deps.sync[i];
                    }
                }

                if (deps.async) {                    
                    for (let i = 0; i < deps.async.length; i++) {
                        deps.async[i] = baseUri + deps.async[i];
                    }
                }
                
                cb(deps);
            });
        } else {
            cb(null);
        }
    }

    loadDependencies(deps: any): void {
        const that = this;

        if (!deps) {
            that.dependenciesLoaded();
        } else if (deps.sync) {
            // load each sync script.
            // necessary for cases like this: https://github.com/mrdoob/three.js/issues/9602
            // then load the async scripts
            SynchronousRequire.load(deps.sync, that.dependencyLoaded).then(() => {
                if (deps.async) {
                    requirejs(deps.async, function() {
                        that.dependenciesLoaded(arguments);
                    });
                } else {
                    that.dependenciesLoaded();
                }
            });
        } else if (deps.async) {
            requirejs(deps.async, function() {
                that.dependenciesLoaded(arguments);
            });
        } else {
            that.dependenciesLoaded();
        }
    }

    dependencyLoaded(index: number, dep: any): void {
        
    }

    dependenciesLoaded(...args: any[]): void {
        this.createModules();
        this.modulesCreated();
        $.publish(BaseEvents.RESIZE); // initial sizing
        $.publish(BaseEvents.CREATED);
        this.update();
        this._setDefaultFocus();
    }

    public update(): void {

        // allow 1ms for subclasses to subscribe to events.
        setTimeout(() => {
            $.publish(BaseEvents.COLLECTION_INDEX_CHANGED, [this.data.collectionIndex]);
            $.publish(BaseEvents.MANIFEST_INDEX_CHANGED, [this.data.manifestIndex]);
            $.publish(BaseEvents.SEQUENCE_INDEX_CHANGED, [this.data.sequenceIndex]);
            $.publish(BaseEvents.CANVAS_INDEX_CHANGED, [this.data.canvasIndex]);
        }, 1);

    }

    private _setDefaultFocus(): void {
        setTimeout(() => {
            if (this.data.config.options.allowStealFocus) {
                $('[tabindex=0]').focus();
            }
        }, 1);
    }

    width(): number {
        return this.$element.width();
    }

    height(): number {
        return this.$element.height();
    }

    exitFullScreen(): void {
        $.publish(BaseEvents.EXIT_FULLSCREEN);
    }

    fire(name: string, ...args: any[]): void {
        this.component.fire(name, arguments[1]);
    }

    redirect(uri: string): void {
        this.fire(BaseEvents.REDIRECT, uri);
    }

    refresh(): void {
        this.fire(BaseEvents.REFRESH, null);
    }

    private _initLocales(): void {
        const availableLocales: any[] = this.data.config.localisation.locales.slice(0);
        const configuredLocales: ILocale[] = this.data.locales;
        const finalLocales: ILocale[] = [];

        // loop through configuredLocales array (those passed in when initialising the UV component)
        // if availableLocales (those available in each extension's l10n directory) contains a configured locale, add it to finalLocales.
        // if the configured locale has a label, substitute it
        // mark locale as added.
        // if limitLocales is disabled,
        // loop through remaining availableLocales and add to finalLocales.

        $.each(configuredLocales, (index: number, configuredLocale: ILocale) => {
            const match: any[] = availableLocales.filter((item: any) => { return item.name === configuredLocale.name; });
            if (match.length) {
                var m: any = match[0];
                if (configuredLocale.label) m.label = configuredLocale.label;
                m.added = true;
                finalLocales.push(m);
            }
        });

        const limitLocales: boolean = Utils.Bools.getBool(this.data.config.options.limitLocales, false);

        if (!limitLocales) {
            $.each(availableLocales, (index: number, availableLocale: any) => {
                if (!availableLocale.added) {
                    finalLocales.push(availableLocale);
                }
                delete availableLocale.added;
            });
        }

        this.data.locales = finalLocales;
    }

    private _parseMetrics(): void {
        const metrics: any[] = this.data.config.options.metrics;

        if (metrics) {
            for (let i = 0; i < metrics.length; i++) {
                const m: any = metrics[i];
                m.type = new MetricType(m.type);
                this.metrics.push(m);
            }
        }
    }

    private _updateMetric(): void {

        for (let i = 0; i < this.metrics.length; i++) {
            const metric: Metric = this.metrics[i];

            if (this.width() > metric.minWidth && this.width() <= metric.maxWidth) {
                if (this.metric !== metric.type) {
                    this.metric = metric.type;
                    $.publish(BaseEvents.METRIC_CHANGED);
                }
            }
        }
    }

    resize(): void {
        this._updateMetric();
        $.publish(BaseEvents.RESIZE);
    }

    // re-bootstraps the application with new querystring params
    reload(data?: IUVData): void {
        $.publish(BaseEvents.RELOAD, [data]);
    }

    isSeeAlsoEnabled(): boolean {
        return this.data.config.options.seeAlsoEnabled !== false;
    }

    getShareUrl(): string | null {
        // If embedded on the home domain and it's the only instance of the UV on the page
        if (this.isDeepLinkingEnabled()) {
            // Use the current page URL with hash params
            if (Utils.Documents.isInIFrame()) {
                return parent.document.location.href;
            } else {
                return document.location.href;
            }            
        } else {
            // If there's a `related` property of format `text/html` in the manifest
            if (this.helper.hasRelatedPage()) {
                // Use the `related` property in the URL box
                var related: any = this.helper.getRelated();
                if (related && related.length) {
                    related = related[0];
                }
                return related['@id'];
            }
        }

        return null;
    }

    getIIIFShareUrl(): string {
        return this.helper.iiifResourceUri + "?manifest=" + this.helper.iiifResourceUri;
    }

    addTimestamp(uri: string): string {
        return uri + "?t=" + Utils.Dates.getTimeStamp();
    }

    isDeepLinkingEnabled(): boolean {
        return (this.data.isHomeDomain && this.data.isOnlyInstance);
    }

    isOnHomeDomain(): boolean {
        return this.isDeepLinkingEnabled();
    }

    getDomain(): string {
        const parts: any = Utils.Urls.getUrlParts(this.helper.iiifResourceUri);
        return parts.host;
    }

    getEmbedDomain(): string | null {
        return this.data.embedDomain;
    }

    getSettings(): ISettings {
        if (Utils.Bools.getBool(this.data.config.options.saveUserSettings, false)) {

            const settings: any = Utils.Storage.get("uv.settings", Utils.StorageType.local);
            
            if (settings) {
                return $.extend(this.data.config.options, settings.value);
            }
        }
        
        return this.data.config.options;
    }

    updateSettings(settings: ISettings): void {
        if (Utils.Bools.getBool(this.data.config.options.saveUserSettings, false)) {

            const storedSettings: any = Utils.Storage.get("uv.settings", Utils.StorageType.local);

            if (storedSettings) {
                settings = $.extend(storedSettings.value, settings);
            }
                
            // store for ten years
            Utils.Storage.set("uv.settings", settings, 315360000, Utils.StorageType.local);
        }
        
        this.data.config.options = $.extend(this.data.config.options, settings);
    }

    getSharePreview(): ISharePreview {

        const title: string = this.helper.getLabel();

        // todo: use getThumb (when implemented)

        const canvas: Manifesto.ICanvas = this.helper.getCurrentCanvas();
        let thumbnail: string = canvas.getProperty('thumbnail');

        if (!thumbnail || !(typeof(thumbnail) === 'string')) {
            thumbnail = canvas.getCanonicalImageUri(this.data.config.options.bookmarkThumbWidth);
        }

        return <ISharePreview>{
            title: title,
            image: thumbnail
        }
    }

    public getPagedIndices(canvasIndex: number = this.helper.canvasIndex): number[] {
        return [canvasIndex];
    }

    public getCurrentCanvases(): Manifesto.ICanvas[] {
        const indices: number[] = this.getPagedIndices(this.helper.canvasIndex);
        const canvases: Manifesto.ICanvas[] = [];
        
        for (let i = 0; i < indices.length; i++) {
            const index: number = indices[i];
            const canvas: Manifesto.ICanvas = this.helper.getCanvasByIndex(index);
            canvases.push(canvas);
        }
        
        return canvases;
    }

    public getCanvasLabels(label: string): string {
        const indices: number[] = this.getPagedIndices();
        let labels: string = "";

        if (indices.length === 1) {
            labels = label;
        } else {
            for (let i = 1; i <= indices.length; i++) {
                if (labels.length) labels += ",";
                labels += label + " " + i;
            }
        }

        return labels;
    }

    public getCurrentCanvasRange(): Manifesto.IRange | null {
        //var rangePath: string = this.currentRangePath ? this.currentRangePath : '';
        //var range: Manifesto.IRange = this.helper.getCanvasRange(this.helper.getCurrentCanvas(), rangePath);
        const range: Manifesto.IRange | null = this.helper.getCanvasRange(this.helper.getCurrentCanvas());
        return range;
    }

    // todo: move to manifold
    public getExternalResources(resources?: Manifold.ExternalResource[]): Promise<Manifold.ExternalResource[]> {

        const indices: number[] = this.getPagedIndices();
        const resourcesToLoad: Manifold.ExternalResource[] = [];

        $.each(indices, (i: number, index: number) => {
            const canvas: Manifesto.ICanvas = this.helper.getCanvasByIndex(index);
            const r: Manifold.ExternalResource = new Manifold.ExternalResource(canvas, <(r: Manifesto.IManifestResource) => string>this.helper.getInfoUri);
            r.index = index;

            // used to reload resources with isResponseHandled = true.
            if (resources) {

                const found: Manifold.ExternalResource | undefined = resources.find((f: Manifold.ExternalResource) => {
                    return f.dataUri === r.dataUri;
                });

                if (found) {
                    resourcesToLoad.push(found);
                } else {
                    resourcesToLoad.push(r);
                }
            } else {
                resourcesToLoad.push(r);
            }
        });

        const storageStrategy: string = this.data.config.options.tokenStorage;
        const authAPIVersion: number = this.data.config.options.authAPIVersion;

        // if using auth api v1
        if (authAPIVersion === 1) {
            console.log("not implemented yet!");
            return new Promise<Manifold.ExternalResource[]>((resolve) => {
                Auth1.loadExternalResources(resourcesToLoad, storageStrategy).then((r: Manifold.ExternalResource[]) => {
                    this.resources = r.map((resource: Manifold.ExternalResource) => {
                        resource.data.index = resource.index;
                        return <Manifold.ExternalResource>Utils.Objects.toPlainObject(resource.data);
                    });

                    resolve(this.resources);
                });
            });
        }
        
        return new Promise<Manifold.ExternalResource[]>((resolve) => {
            Auth09.loadExternalResources(resourcesToLoad, storageStrategy).then((r: Manifold.ExternalResource[]) => {
                this.resources = r.map((resource: Manifold.ExternalResource) => {
                    resource.data.index = resource.index;
                    return <Manifold.ExternalResource>Utils.Objects.toPlainObject(resource.data);
                });

                resolve(this.resources);
            });
        });
    }

    viewCanvas(canvasIndex: number): void {

        if (this.helper.isCanvasIndexOutOfRange(canvasIndex)) {
            this.showMessage(this.data.config.content.canvasIndexOutOfRange);
            canvasIndex = 0;
        }

        this.lastCanvasIndex = this.helper.canvasIndex;
        this.helper.canvasIndex = canvasIndex;

        $.publish(BaseEvents.OPEN_EXTERNAL_RESOURCE);
    }

    showMessage(message: string, acceptCallback?: Function, buttonText?: string, allowClose?: boolean): void {

        this.closeActiveDialogue();

        $.publish(BaseEvents.SHOW_GENERIC_DIALOGUE, [
            {
                message: message,
                acceptCallback: acceptCallback,
                buttonText: buttonText,
                allowClose: allowClose
            }]);
    }

    closeActiveDialogue(): void{
        $.publish(BaseEvents.CLOSE_ACTIVE_DIALOGUE);
    }

    isOverlayActive(): boolean{
        return Shell.$overlays.is(':visible');
    }

    viewManifest(manifest: Manifesto.IManifest): void{
        const data: IUVData = <IUVData>{};
        data.iiifResourceUri = this.helper.iiifResourceUri;
        data.collectionIndex = <number>this.helper.getCollectionIndex(manifest);
        data.manifestIndex = <number>manifest.index;
        data.sequenceIndex = 0;
        data.canvasIndex = 0;

        this.reload(data);
    }

    viewCollection(collection: Manifesto.ICollection): void{
        const data: IUVData = <IUVData>{};
        data.iiifResourceUri = this.helper.iiifResourceUri;
        data.collectionIndex = collection.index;
        data.manifestIndex = 0;
        data.sequenceIndex = 0;
        data.canvasIndex = 0;

        this.reload(data);
    }

    isFullScreen(): boolean {
        return this.component.isFullScreen;
    }

    isHeaderPanelEnabled(): boolean {
        return Utils.Bools.getBool(this.data.config.options.headerPanelEnabled, true);
    }

    isLeftPanelEnabled(): boolean {
        if (Utils.Bools.getBool(this.data.config.options.leftPanelEnabled, true)) {
            if (this.helper.hasParentCollection()) {
                return true;
            } else if (this.helper.isMultiCanvas()) {
                if (this.helper.getViewingHint().toString() !== manifesto.ViewingHint.continuous().toString()) {
                    return true;
                }
            }
        }

        return false;
    }

    isRightPanelEnabled(): boolean {
        return  Utils.Bools.getBool(this.data.config.options.rightPanelEnabled, true);
    }

    isFooterPanelEnabled(): boolean {
        return Utils.Bools.getBool(this.data.config.options.footerPanelEnabled, true);
    }

    useArrowKeysToNavigate(): boolean {
        return Utils.Bools.getBool(this.data.config.options.useArrowKeysToNavigate, true);
    }

    bookmark(): void {
        // override for each extension
    }

    feedback(): void {
        this.fire(BaseEvents.FEEDBACK, this.data);
    }

    getAlternateLocale(): ILocale | null {
        let alternateLocale: ILocale | null = null;

        if (this.data.locales.length > 1) {
            alternateLocale = this.data.locales[1];
        }

        return alternateLocale;
    }

    getSerializedLocales(): string {
        return this.serializeLocales(this.data.locales);
    }

    serializeLocales(locales: ILocale[]): string {
        let serializedLocales: string = '';

        for (let i = 0; i < locales.length; i++) {
            const l = locales[i];
            if (i > 0) serializedLocales += ',';
            serializedLocales += l.name;
            if (l.label) {
                serializedLocales += ':' + l.label;
            }
        }

        return serializedLocales;
    }

    changeLocale(locale: string): void {

        // re-order locales so the passed locale is first

        const data: IUVData = <IUVData>{};
        data.locales = this.data.locales.clone();

        const index: number = data.locales.findIndex((l: any) => {
            return l.name === locale;
        });

        data.locales.move(index, 0);

        this.reload(data);
    }

    // auth

    
}