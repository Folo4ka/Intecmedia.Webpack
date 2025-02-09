const path = require('path');
const slash = require('slash');
const SVGO = require('svgo');
const weblog = require('webpack-log');
const { SvgoPrefixConfig } = require('./svgo.config.js');

const logger = weblog({ name: 'loader-svgo' });

module.exports = function SvgLoader(content) {
    const loaderContext = this;
    if (loaderContext.cacheable) loaderContext.cacheable();
    const loaderCallback = loaderContext.async();

    const name = path.basename(loaderContext.resourcePath, '.svg');
    const options = SvgoPrefixConfig(`svgo-${name.toLowerCase()}-`);
    const svgoInstance = new SVGO(options);

    const relativePath = slash(path.relative(__dirname, loaderContext.resourcePath));
    logger.info(`optimize(${JSON.stringify(relativePath)})`);

    svgoInstance.optimize(content).then((result) => {
        logger.info(result.info);
        const prefix = `<!-- ${JSON.stringify(relativePath)} -->\n`;
        const suffix = `\n<!-- /${JSON.stringify(relativePath)} -->\n`;
        const exportString = `module.exports = ${JSON.stringify(prefix + result.data.trim() + suffix)}`;
        loaderCallback(null, exportString);
    }).catch((error) => {
        loaderCallback(error);
    });
};
module.exports.raw = true;
