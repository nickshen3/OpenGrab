export namespace main {
	
	export class Format {
	    id: string;
	    ext: string;
	    resolution: string;
	    fps: number;
	    filesizeMb: number;
	    vcodec: string;
	    acodec: string;
	
	    static createFrom(source: any = {}) {
	        return new Format(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.ext = source["ext"];
	        this.resolution = source["resolution"];
	        this.fps = source["fps"];
	        this.filesizeMb = source["filesizeMb"];
	        this.vcodec = source["vcodec"];
	        this.acodec = source["acodec"];
	    }
	}
	export class Meta {
	    id: string;
	    title: string;
	    uploader: string;
	    duration: number;
	    thumbnail: string;
	    webpageUrl: string;
	    extractor: string;
	    isPlaylist: boolean;
	    entries?: Meta[];
	    formats: Format[];
	
	    static createFrom(source: any = {}) {
	        return new Meta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.uploader = source["uploader"];
	        this.duration = source["duration"];
	        this.thumbnail = source["thumbnail"];
	        this.webpageUrl = source["webpageUrl"];
	        this.extractor = source["extractor"];
	        this.isPlaylist = source["isPlaylist"];
	        this.entries = this.convertValues(source["entries"], Meta);
	        this.formats = this.convertValues(source["formats"], Format);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class BatchResult {
	    metas: Meta[];
	    fails: string[];
	
	    static createFrom(source: any = {}) {
	        return new BatchResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.metas = this.convertValues(source["metas"], Meta);
	        this.fails = source["fails"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	

}

