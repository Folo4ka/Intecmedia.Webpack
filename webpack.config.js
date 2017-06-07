const util = require("util"), path = require("path");
const webpack = require("webpack");

const IS_PROD = process.argv.indexOf("-p") !== -1;
const NODE_ENV = IS_PROD ? "production" : "development";
console.log("Config enviroment: " + NODE_ENV);

const extractPlugin = new (require("extract-text-webpack-plugin"))({
    filename: "./assets/app.min.css"
});

const banner = new String;
banner.toString = () => {
    return util.format("Generated by Intecmedia.Webpack: %s | %s | [hash]", new Date().toISOString(), NODE_ENV);
};

const sassIncludePaths = [
    path.resolve("./node_modules/bootstrap-sass/assets/stylesheets")
];

module.exports = {

    entry: [
        "./app/app.js"
    ],

    output: {
        path: __dirname,
        filename: "./assets/app.min.js"
    },

    plugins: (IS_PROD ? [
        // prod-only
        new webpack.EnvironmentPlugin({
            NODE_ENV: "production",
            DEBUG: false
        }),
        new webpack.DefinePlugin({
            "NODE_ENV": JSON.stringify("production"),
            "process.env": {
                "NODE_ENV": "production"
            }
        }),
        new webpack.optimize.UglifyJsPlugin({
            banner: banner,
            beautify: false,
            comments: false
        })
    ] : [
        // dev-only
        new webpack.EnvironmentPlugin({
            NODE_ENV: "development",
            DEBUG: true
        }),
        new webpack.DefinePlugin({
            "NODE_ENV": JSON.stringify("development"),
            "process.env": {
                "NODE_ENV": "development"
            }
        })
    ]).concat([
        // dev-and-prod
        extractPlugin,
        new webpack.BannerPlugin({
            banner: banner
        }),
        new webpack.ProvidePlugin({
            $: "jquery",
            jQuery: "jquery"
        })
    ]),

    devtool: (IS_PROD ? "" : "inline-source-map"),

    resolve: {
        alias: {
            "bootstrap": "bootstrap-sass/assets/javascripts/bootstrap"
        }
    },

    module: {
        rules: [
            // javascript loaders
            {
                test: /\.js$/,
                include: /node_modules/,
                loader: "imports-loader",
                options: {
                    "$": "jquery",
                    "jQuery": "jquery"
                }
            },
            {
                test: /\.js$/,
                exclude: /node_modules/,
                loader: "babel-loader",
                options: {
                    presets: ["env"],
                    forceEnv: NODE_ENV,
                    cacheDirectory: !IS_PROD
                }
            },
            // image loaders
            {
                test: /\.(jpe?g|png|gif|svg)$/i,
                exclude: /fonts/,
                loaders: [
                    {
                        loader: "url-loader",
                        options: {
                            limit: 32 * 1024
                        }
                    },
                    {
                        loader: "file-loader",
                        options: {
                            name: "assets/img/[name].[ext]?v=[hash]"
                        }
                    },
                    {
                        loader: "image-webpack-loader",
                        options: {
                            bypassOnDebug: !IS_PROD
                        }
                    }
                ]
            },
            // font loaders
            {
                test: /\.(eot|woff|woff2|ttf|svg)(\?v=.+)?$/,
                loaders: [
                    {
                        loader: "file-loader",
                        options: {
                            name: "assets/fonts/[name].[ext]?v=[hash]"
                        }
                    }
                ]
            },
            // css loaders
            {
                test: /\.s?css$/,
                loader: extractPlugin.extract({
                    fallback: [
                        {
                            loader: "style-loader",
                            options: {
                                sourceMap: !IS_PROD
                            }
                        }
                    ],
                    use: [
                        {
                            loader: "css-loader",
                            options: {
                                importLoaders: 1, // index of 'sass-loader'
                                sourceMap: !IS_PROD
                            }
                        },
                        {
                            loader: "sass-loader",
                            options: {
                                data: "$NODE_ENV: " + NODE_ENV + ";",
                                indentWidth: 4,
                                includePaths: sassIncludePaths,
                                sourceMapEmbed: !IS_PROD,
                                sourceMapContents: !IS_PROD
                            }
                        },
                        {
                            loader: "postcss-loader",
                            options: {
                                sourceMap: !IS_PROD,
                                plugins: [
                                    // dev-and-prod
                                    require("postcss-cssnext")({
                                        warnForDuplicates: false
                                    })
                                ].concat(IS_PROD ? [
                                    // prod-only
                                    require("css-mqpacker")({
                                        sort: true
                                    }),
                                    require("cssnano")({
                                        discardComments: {
                                            removeAll: true
                                        }
                                    })
                                ] : [
                                    // dev-only
                                ])
                            }
                        }
                    ]
                })
            }
        ]
    }

};