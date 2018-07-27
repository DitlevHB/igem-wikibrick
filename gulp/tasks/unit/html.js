var gulp = require('gulp');
var gulpif = require('gulp-if');
var markdown = require('gulp-markdown');
var cheerio = require('gulp-cheerio');
var Promise = require('bluebird');
var browsersync = require('browser-sync');
var replace = require('gulp-replace');
var rename = require('gulp-rename');
var _ = require('lodash');
var banner = require('../../banner');
var lazypipe = require('lazypipe');
var handlebars = require('gulp-compile-handlebars');
var pandoc = require('gulp-pandoc');
var glob = require('globby');
var tap = require('gulp-tap');

const path = require('path');
const url = require('url');

var config = global.wikibrick;
var targets = config.targets;
var env = config.environment;
var srcs = targets.buildsrc;
var dests = targets.buildtarget;

const urls = targets.urls;
const suffixes = targets.suffixes;

urlIsRelative = require('./relative2absolute').urlIsRelative;

relative2absolute = function($, file) {
    var uploadmap = require('./relative2absolute').uploadmap();

    return new Promise((resolve, reject) => {

        // Set absolute paths for images
        images =  $('img').each(function () {
            var img = $(this);
            var relname = img.attr('src');
            if (relname != null && urlIsRelative(relname) && uploadmap.hasOwnProperty(path.basename(relname))) { // Check to see if a map exists, otherwise do not change
                img.attr('src', uploadmap[path.basename(relname)]);
            }
        });

        // Set absolute path for stylesheets
        stylesheets = $('link[rel=stylesheet]', 'head').each(function () {
            var link = $(this);
            var relname = link.attr('href');
            if (relname != null && urlIsRelative(relname)) {
                link.attr('href', new URL(path.basename(relname).replace('.css', '') + suffixes.css, urls.css));
            }
        });

        // Set absolute paths for scripts
        scripts = $('script').each(function () {
            var script = $(this);
            var relname = script.attr('src');
            if (relname != null && urlIsRelative(relname)) {
                script.attr('src', new URL(path.basename(relname).replace('.js', '') + suffixes.js, urls.js));
            }
            
            if(script.text() != null) {
                urlReplace = /\.load\( *'(\.)?(\/)?(.*)\.html' *\);/gi;

                script.text(script.text().replace(urlReplace, function (match, $1, $2, $3, offest, original) {
                    return ".load('" + new URL(urls.template, path.basename($3) + targets.suffixes.js) + "');";
                }));
            }
        });

        // Set absolute path for index
        index = $('a[href="/index.html"]').each(function () {
            var a = $(this);
            a.attr('href', urls.standard);
        });

        // Set absolute path for all internal links
        links = $('a').each(function () {
            var a = $(this);
            var relname = a.attr('href');
            if (relname != null && relname != "index.html" && urlIsRelative(relname)) {
                if (!relname.match(/^(\.)?(\/)?pages\//)) {
                    a.attr('href', new URL(path.basename(a.attr('href')).replace('.html', ''), urls.standard));
                }
                else { //Todo: Make this support nested pages
                    a.attr('href', new URL(path.basename(a.attr('href')).replace('.html', ''), urls.standard));
                }
            }
        })

        // Unwrap head and body elements
        unwrap = $('head, body').each(function () {
            var u = $(this);
            u.replaceWith(u.html());
        })

        // Remove iGEM Navbar Placeholder
        removeplaceholders = $('#igem-navbar-placeholder').replaceWith('');

        Promise.all([images, stylesheets, scripts, index, links, removeplaceholders]).then(resolve);
    });
}
// Function shared by all HTML processing tasks for development builds. 
// Currently just stages HTML files to build folder.

var prepHTML = lazypipe()
    .pipe(() => gulpif(env.relative2absolute, cheerio({
        run: relative2absolute,
        parserOptions: {
            decodeEntities: false
        }
    }))) // Think about using lazypipe here
    .pipe(() => gulpif(env.relative2absolute, replace(/<!DOCTYPE html>/g, '')))
    .pipe(() => gulpif(env.serve, browsersync.stream()))

var renameToHTML = lazypipe()
    .pipe(rename, function(path) {
        path.extname = '.html';
    })

var prepHBS = lazypipe()
    .pipe(renameToHTML)
    .pipe(tap, function(file, t) {
        return t.through(handlebars, [{}, {
        ignorePartials: true,
        // The world's shittiest hack:tm: to get around the errrr thrown by 
        // gulp-compile-handlebars when srcs.partials is empty and no batch 
        // files are available
        batch: function() {
            if (glob.sync(srcs.partials).length > 0) {
                return [srcs.partials];
            }
            else {
                return;
            }
        }(),
        helpers: config.handlebars.helpers(file, t)
    }])})

// Task to prep all non-home pages, I.E. Project Description, Team, etc.
gulp.task('build:html:pages', () =>
    gulp.src(srcs.htmlpages)
    .pipe(prepHTML())
    .pipe(gulp.dest(dests.pages))
);

// Task to prep all pages, I.E. Project Description, Team, etc.
gulp.task('build:hbs:pages', () =>
    gulp.src(srcs.hbspages)
    .pipe(prepHBS())
    .pipe(prepHTML())
    .pipe(renameToHTML())
    .pipe(gulpif(env.banner, banner.html())) // Only bannerize top-level pages
    .pipe(gulp.dest(dests.pages))
);

gulp.task('build:html:content', () =>
    gulp.src(srcs.htmlcontent)
    .pipe(prepHBS())
    .pipe(prepHTML())
    .pipe(gulp.dest(dests.content))
);

gulp.task('build:markdown:content', () =>
    gulp.src(srcs.markdowncontent)
    .pipe(prepHBS())
    .pipe(markdown(config.markdown.options))
    .pipe(prepHTML())
    .pipe(gulp.dest(dests.content))
);

gulp.task('build:docx:content', () =>
    gulp.src(srcs.docxcontent)
    .pipe(prepHBS())
    .pipe(prepHTML())
    .pipe(pandoc({
        from: 'docx',
        to: 'html5',
        ext: '.html'
    }))
    .pipe(gulp.dest(dests.content))
);

// Task to prep templates like headers, footers, etc. that can be reused on many pages
gulp.task('build:templates', () =>
    gulp.src(srcs.templates)
    .pipe(prepHTML())
    .pipe(gulp.dest(dests.templates))
);