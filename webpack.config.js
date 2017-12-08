/* eslint global-require: "off" */
const fs = require('fs');
const glob = require('glob');
const path = require('path');
const slash = require('slash');
const webpack = require('webpack');
const MD5 = require('md5.js');

const DEBUG = ('DEBUG' in process.env && parseInt(process.env.DEBUG, 10) > 0);
const DEV_SERVER = path.basename(require.main.filename, '.js') === 'webpack-dev-server';
const PROD = ('NODE_ENV' in process.env && process.env.NODE_ENV === 'production') || process.argv.indexOf('-p') !== -1;
const NODE_ENV = PROD ? 'production' : 'development';

const USE_SOURCE_MAP = DEBUG && !PROD;
const USE_LINTERS = PROD || DEBUG;

const { name: PACKAGE_NAME, browserslist: BROWSERS } = require('./package.json');

const OUTPUT_PATH = path.resolve(__dirname, 'build');
const PUBLIC_PATH = '/';

const USE_SERVICE_WORKER = false;
const SERVICE_WORKER_BASE = slash(path.relative(PUBLIC_PATH, '/'));

console.log(`Name: ${PACKAGE_NAME}`);
console.log(`Output: ${OUTPUT_PATH}`);
console.log(`Public: ${PUBLIC_PATH}`);
console.log(`Enviroment: ${NODE_ENV}`);
console.log(`Debug: ${DEBUG ? 'enabled' : 'disabled'}`);
console.log(`Linters: ${USE_LINTERS ? 'enabled' : 'disabled'}`);
console.log(`Source maps: ${USE_SOURCE_MAP ? 'enabled' : 'disabled'}`);
console.log(`Service Worker: ${USE_SERVICE_WORKER ? 'enabled' : 'disabled'}`);

if (PROD && DEBUG) {
    throw new Error(`Dont use NODE_ENV=${NODE_ENV} and DEBUG=${DEBUG} together`);
}

const ExtractTextPlugin = require('extract-text-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const StyleLintPlugin = (USE_LINTERS ? require('stylelint-webpack-plugin') : () => {});
const WebpackNotifierPlugin = require('webpack-notifier');
const SWPrecacheWebpackPlugin = require('sw-precache-webpack-plugin');
const { default: ImageminPlugin } = require('imagemin-webpack-plugin');
const CaseSensitivePathsPlugin = (PROD ? require('case-sensitive-paths-webpack-plugin') : () => {});
const CopyWebpackPlugin = require('copy-webpack-plugin');

const FaviconsPlugin = require('./favicons.js');
const HtmlPrettyPlugin = require('./html-pretty.js');
const ManifestPlugin = require('./manifest.js');

const banner = new String(''); // eslint-disable-line no-new-wrappers
banner.toString = () => `NODE_ENV=${NODE_ENV} | DEBUG=${DEBUG} | chunkhash=[chunkhash]`;

const HTML_OPTIONS = {
    DEBUG,
    NODE_ENV,
    PUBLIC_PATH,
    USE_SERVICE_WORKER,
    SERVICE_WORKER_HASH: (USE_SERVICE_WORKER ? () => {
        const hash = new MD5();
        const filename = path.join(OUTPUT_PATH, SERVICE_WORKER_BASE, 'service-worker.js');
        if (fs.existsSync(filename)) {
            hash.update(fs.readFileSync(filename));
        }
        return hash.digest('hex');
    } : false),
};

const resourceName = (prefix, hash = false) => {
    const basename = path.basename(prefix);
    const suffix = (hash ? '?[hash]' : '');
    return (resourcePath) => {
        const url = slash(path.relative(path.join(__dirname, 'source'), resourcePath));
        if (url.startsWith(`${basename}/`)) {
            return url + suffix;
        }
        if (url.startsWith('../node_modules/')) {
            const [, , modulename] = url.split('/', 3);
            return slash(path.join(basename, modulename, `[name].[ext]${suffix}`));
        }
        return slash(path.join(basename, `[name].[ext]${suffix}`));
    };
};

module.exports = {

    watchOptions: {
        ignored: /node_modules/,
    },

    devServer: {
        open: true,
        overlay: true,
        compress: false,
        setup(app) {
            app.get('/service-worker.js', (req, res) => {
                const filename = path.join(OUTPUT_PATH, SERVICE_WORKER_BASE, '/service-worker.js');
                const content = fs.existsSync(filename) ? fs.readFileSync(filename) : '';
                res.set({ 'Content-Type': 'application/javascript; charset=utf-8' });
                res.send(content);
            });
        },
    },

    entry: {
        app: './source/js/app.js',
    },

    output: {
        path: OUTPUT_PATH,
        publicPath: PUBLIC_PATH,
        filename: 'js/app.min.js',
    },

    performance: {
        hints: PROD && !DEBUG ? 'error' : false,
        maxAssetSize: 512 * 1024,
        maxEntrypointSize: 512 * 1024,
        assetFilter: (uri) => {
            const [filename] = uri.split('?', 2);
            const ignore = /(\.map|\.LICENSE|\.eot|\.ttf|manifest\.json|service-worker\.js)$/;
            return !(ignore.test(filename));
        },
    },

    plugins: [
        new ExtractTextPlugin({
            filename: 'css/app.min.css',
            allChunks: true,
        }),
        ...(PROD ? [
            new CaseSensitivePathsPlugin(),
            new webpack.NoEmitOnErrorsPlugin(),
            new webpack.optimize.UglifyJsPlugin({
                parallel: true,
                sourceMap: true,
                extractComments: true,
                uglifyOptions: {
                    output: {
                        comments: false,
                    },
                },
            }),
        ] : []),
        new webpack.BannerPlugin({
            banner,
        }),
        new webpack.ProvidePlugin({
            $: 'jquery',
            jQuery: 'jquery',
        }),
        new webpack.DefinePlugin({
            DEBUG: JSON.stringify(DEBUG),
            NODE_ENV: JSON.stringify(NODE_ENV),
        }),
        new WebpackNotifierPlugin({
            alwaysNotify: true,
            contentImage: path.resolve('./.favicons-source-512x512.png'),
            title: PACKAGE_NAME,
        }),
        ...(USE_LINTERS ? [new StyleLintPlugin({
            configFile: '.stylelintrc',
            files: ['**/*.scss'],
            fix: !DEV_SERVER,
            syntax: 'scss',
            quiet: PROD,
        })] : []),
        new FaviconsPlugin.AppIcon({
            logo: './.favicons-source-512x512.png',
            prefix: 'img/favicon/',
            background: '#fff',
            theme_color: '#fff',
            persistentCache: !(PROD || DEBUG),
        }),
        new FaviconsPlugin.FavIcon({
            logo: './.favicons-source-32x32.png',
            prefix: 'img/favicon/',
            persistentCache: !(PROD || DEBUG),
        }),
        new ManifestPlugin({
            path: path.join(OUTPUT_PATH, '/img/favicon/manifest.json'),
            replace: {
                lang: 'ru-RU',
                start_url: '/?utm_source=app_manifest',
                theme_color: '#fff',
                background_color: '#fff',
            },
        }),
        ...(glob.sync('./source/*.html').map(template => new HtmlWebpackPlugin({
            filename: path.basename(template),
            template,
            inject: true,
            minify: false,
            hash: true,
            cache: !(PROD || DEBUG),
            title: PACKAGE_NAME,
            ...HTML_OPTIONS,
        }))),
        new HtmlPrettyPlugin({
            ocd: true,
            unformatted: ['code', 'pre'],
            indent_inner_html: false,
            indent_size: 4,
        }),
        ...(USE_SERVICE_WORKER ? [new SWPrecacheWebpackPlugin({
            minify: PROD,
            handleFetch: true,
            filename: `${SERVICE_WORKER_BASE}/service-worker.js`,
            staticFileGlobs: [
                slash(path.join(OUTPUT_PATH, '/js/*.min.js')),
                slash(path.join(OUTPUT_PATH, '/css/*.min.css')),
                slash(path.join(OUTPUT_PATH, '/fonts/*.woff2')),
            ],
            runtimeCaching: [{
                urlPattern: /^chrome-extension:\/\//,
                handler: 'networkOnly',
                options: { debug: !PROD },
            }, {
                urlPattern: /(.*)/,
                handler: 'networkFirst',
                options: { debug: !PROD },
            }, {
                urlPattern: new RegExp(`${PUBLIC_PATH}(js|css|fonts|img)/(.*)`),
                handler: 'cacheFirst',
                options: { debug: !PROD },
            }],
            staticFileGlobsIgnorePatterns: [/\.map$/, /\.LICENSE$/],
            ignoreUrlParametersMatching: [/^utm_/, /^[a-fA-F0-9]{32}$/],
        })] : []),
        new CopyWebpackPlugin([{
            context: './source',
            from: 'img/**/*.{png,svg,ico,gif,xml,jpeg,jpg,json}',
            copyUnmodified: !(PROD || DEBUG),
            to: OUTPUT_PATH,
        }], {
            debug: (DEBUG ? 'debug' : 'info'),
        }),
        new ImageminPlugin({
            test: /\.(jpe?g|png|gif|svg)$/i,
            svgo: {
                plugins: [
                    { removeViewBox: false },
                ],
            },
            disable: !(PROD || DEBUG),
        }),
    ],

    devtool: USE_SOURCE_MAP ? 'eval-source-map' : 'nosources-source-map',

    resolve: {
        alias: {
            modernizr$: path.resolve(__dirname, '.modernizrrc'),
        },
    },

    module: {
        rules: [
            // html loaders
            {
                test: /\.html$/i,
                loader: 'handlebars-loader',
                options: {
                    debug: DEBUG,
                    helperDirs: path.join(__dirname, 'source', 'helpers'),
                },
            },
            // javascript loaders
            {
                test: /\.modernizrrc$/,
                loader: 'modernizr-loader!json-loader',
            },
            {
                test: /\.js$/i,
                include: /node_modules/,
                loader: 'imports-loader',
                options: {
                    $: 'jquery',
                    jQuery: 'jquery',
                },
            },
            {
                test: /\.js$/i,
                exclude: /(node_modules|external)/,
                loaders: [
                    {
                        loader: 'babel-loader',
                        options: {
                            presets: [['airbnb', {
                                debug: DEBUG || PROD,
                                targets: {
                                    browsers: BROWSERS,
                                },
                            }]],
                            forceEnv: NODE_ENV,
                            cacheDirectory: !PROD,
                        },
                    },
                    ...(USE_LINTERS ? [{
                        loader: 'eslint-loader',
                        options: {
                            fix: true,
                            cache: !PROD,
                            quiet: PROD,
                        },
                    }] : []),
                ],
            },
            // image loaders
            {
                test: /\.(jpe?g|png|gif|svg|ico)$/i,
                exclude: /(fonts|font)/i,
                loaders: [
                    {
                        loader: 'url-loader',
                        options: {
                            limit: 32 * 1024,
                            name: resourceName('img', false),
                        },
                    },
                ],
            },
            // font loaders
            {
                test: /\.(eot|woff|woff2|ttf|svg)(\?v=.+)?$/i,
                exclude: /(img|images)/i,
                loader: 'file-loader',
                options: {
                    name: resourceName('fonts', true),
                },
            },
            // css loaders
            {
                test: /\.(css|scss)$/i,
                loaders: (DEBUG || DEV_SERVER ? ['css-hot-loader'] : []).concat(ExtractTextPlugin.extract({
                    fallback: [
                        {
                            loader: 'style-loader',
                            options: {
                                sourceMap: USE_SOURCE_MAP,
                            },
                        },
                    ],
                    use: [
                        {
                            loader: 'css-loader',
                            options: {
                                sourceMap: USE_SOURCE_MAP,
                                minimize: (PROD ? {
                                    discardComments: {
                                        removeAll: true,
                                    },
                                } : false),
                            },
                        },
                        {
                            loader: 'postcss-loader',
                            options: {
                                sourceMap: USE_SOURCE_MAP ? 'inline' : false,
                                plugins: [
                                    require('postcss-input-style')(),
                                    require('postcss-quantity-queries')(),
                                    require('postcss-responsive-type')(),
                                    ...(PROD || DEBUG ? [
                                        require('pixrem')(),
                                        require('pleeease-filters')(),
                                        require('postcss-image-set-polyfill')(),
                                        require('postcss-color-rgba-fallback')(),
                                        require('postcss-flexbugs-fixes')(),
                                        require('css-mqpacker')(),
                                        require('autoprefixer')({ browsers: BROWSERS }), // this always last
                                    ] : []),
                                    require('postcss-reporter')(), // this always last
                                ],
                            },
                        },
                        {
                            loader: 'sass-loader',
                            options: {
                                data: `$NODE_ENV: '${NODE_ENV}';\n$DEBUG: ${DEBUG ? 'true' : false};\n`,
                                indentWidth: 4,
                                sourceMap: USE_SOURCE_MAP ? 'inline' : false,
                                sourceMapEmbed: USE_SOURCE_MAP,
                                sourceComments: USE_SOURCE_MAP,
                            },
                        },
                        ...(USE_LINTERS ? [{
                            loader: 'stylefmt-loader',
                            options: {
                                config: '.stylelintrc',
                            },
                        }] : []),
                    ],
                })),
            },
        ],
    },

};
