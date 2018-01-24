const fs = require('fs');
const gm = require('gm');
const path = require('path');
const flatCache = require('flat-cache');
const loaderUtils = require('loader-utils');
const urlLoader = require('url-loader');
const fileLoader = require('file-loader');
const deepAssign = require('deep-assign');
const weblog = require('webpack-log');

const logger = weblog({ name: 'loader-resize' });

const DEFAULT_OPTIONS = {
    imageMagick: true,
};

const resizeCache = flatCache.load('resize', path.resolve('./node_modules/.cache/loader-resize'));
module.exports.resizeCache = resizeCache;

module.exports = function ResizeLoader(content) {
    const loaderContext = this;
    if (loaderContext.cacheable) loaderContext.cacheable();
    const loaderCallback = this.async();

    const query = loaderContext.resourceQuery ? loaderUtils.parseQuery(loaderContext.resourceQuery) : {};
    const options = deepAssign(
        {},
        DEFAULT_OPTIONS,
        loaderUtils.getOptions(loaderContext),
    );
    const nextLoader = ('inline' in query && query.inline === 'inline' ? urlLoader : fileLoader);
    if (!('resize' in query)) {
        return loaderCallback(null, nextLoader.call(loaderContext, content));
    }

    const resourceInfo = path.parse(loaderContext.resourcePath);
    const relativePath = path.relative(__dirname, loaderContext.resourcePath);
    const imageMagick = gm.subClass({ imageMagick: options.imageMagick });

    const resourceStat = fs.statSync(this.resourcePath);
    const cacheKey = `${this.resourcePath}?${JSON.stringify(query)}&${JSON.stringify(resourceStat)}`;

    let [, resizeWidth,, resizeHeight, resizeFlag] = query.resize.trim().match(/^(\d*)(x(\d*))?([!><^])?$/);
    resizeWidth = parseInt(resizeWidth, 10);
    resizeHeight = parseInt(resizeHeight, 10);
    resizeFlag = (resizeFlag || '').trim();
    const resizeFlagNames = {
        '': '', '!': '-ignore-aspect', '>': '-shrink-larger', '<': '-enlarge-smaller', '^': '-fill-area',
    };
    if (!(resizeFlag in resizeFlagNames)) {
        return loaderCallback(`Unknow resize flag: '${query.resize}'`);
    }

    const format = (query.format || resourceInfo.ext.substr(1)).toLowerCase();
    const name = (query.name || (
        `${resourceInfo.name}@resize-${resizeWidth || ''}x${resizeHeight || ''}${resizeFlagNames[resizeFlag]}`
    )) + (query.suffix ? `-${query.suffix}` : '');

    const cacheData = resizeCache.getKey(cacheKey);
    if (cacheData !== undefined && cacheData.type === 'Buffer' && cacheData.data) {
        logger.info(`load cache '${relativePath}${loaderContext.resourceQuery}'`);
        loaderContext.resourcePath = path.join(resourceInfo.dir, `${name}.${format}`);
        loaderCallback(null, nextLoader.call(loaderContext, Buffer.from(cacheData.data)));
    } else {
        imageMagick(content).size(function sizeCallback(sizeError, size) {
            if (sizeError) { loaderCallback(sizeError); return; }

            this.resize(resizeWidth || size.width, resizeHeight || size.height, resizeFlag);
            const quality = query.quality ? parseInt(query.quality, 10) : 0;
            if (quality > 0) {
                this.quality(quality);
            }

            this.toBuffer(format.toUpperCase(), (bufferError, buffer) => {
                if (bufferError) { loaderCallback(bufferError); return; }
                logger.info(`save cache '${relativePath}${loaderContext.resourceQuery}'`);
                resizeCache.setKey(cacheKey, buffer.toJSON());
                loaderContext.resourcePath = path.join(resourceInfo.dir, `${name}.${format}`);
                loaderCallback(null, nextLoader.call(loaderContext, buffer));
                resizeCache.save(true);
            });
        });
    }
};

module.exports.raw = true;

const DEFAULT_SIZES = {
    xs: 576, sm: 768, md: 992, lg: 1200, xl: 1900,
};
const DEFAULT_BREAKPOINTS = ['xs', 'sm', 'md', 'lg', 'xl'];
const breakpointsMedia = (breakpoints, sizes) => {
    const sorted = DEFAULT_BREAKPOINTS.filter(i => breakpoints.includes(i));
    const merged = Object.assign({}, sizes, DEFAULT_SIZES);

    const result = new Map();
    sorted.forEach((breakpoint, index) => {
        result[breakpoint] = [
            // not first
            ...(index >= 1 && sorted[index - 1] ? [`(min-width: ${merged[sorted[index - 1]]}px)`] : []),
            // not last
            ...(index !== sorted.length - 1 ? [`(max-width: ${merged[breakpoint] - 1}px)`] : []),
        ].join(' and ');
    });
    return result;
};

module.exports.breakpointsMedia = breakpointsMedia;
module.exports.breakpointsMedia.DEFAULT_SIZES = DEFAULT_SIZES;
module.exports.breakpointsMedia.DEFAULT_BREAKPOINTS = DEFAULT_BREAKPOINTS;
