const gulp = require('gulp'),
	debug = require('gulp-debug'),
	clean = require('gulp-clean'),
	sass = require('gulp-sass')(require('sass')),
	postcss = require('gulp-postcss'),
	header = require('gulp-header'),
	cleanCSS = require('gulp-clean-css'),
	rtlcss = require('gulp-rtlcss'),
	minifyJS = require('gulp-terser'),
	rename = require('gulp-rename'),
	purgecss = require('gulp-purgecss'),
	rollupStream = require('@rollup/stream'),
	rollupBabel = require('rollup-plugin-babel'),
	rollupCleanup = require('rollup-plugin-cleanup'),
	{ nodeResolve } = require('@rollup/plugin-node-resolve'),
	rollupCommonjs = require('@rollup/plugin-commonjs'),
	rollupReplace = require('@rollup/plugin-replace'),
	vinylSource = require('vinyl-source-stream'),
	vinylBuffer = require('vinyl-buffer'),
	browserSync = require('browser-sync'),
	spawn = require('cross-spawn'),
	path = require('path'),
	yargs = require('yargs/yargs'),
	cp = require('child_process'),
	pkg = require('./package.json'),
	year = new Date().getFullYear(),
	replace = require('gulp-replace'),
	argv = yargs(process.argv).argv

let BUILD = false,
	distDir = './dist',
	demoDir = './demo',
	srcDir = './src'

/**
 * Enable BUILD mode and set directories
 */
gulp.task('build-on', (cb) => {
	BUILD = true
	cb()
})

/**
 * Return banner added to CSS and JS dist files
 */
const getBanner = () => {
	return `/*!
* Tabler v${pkg.version} (${pkg.homepage})
* @version ${pkg.version}
* @link ${pkg.homepage}
* Copyright 2018-${year} The Tabler Authors
* Copyright 2018-${year} codecalm.net Paweł Kuna
* Licensed under MIT (https://github.com/tabler/tabler/blob/master/LICENSE)
*/
`
}

/**
 * Clean `dist` folder before build
 */
gulp.task('clean-dirs', () => {
	return gulp
		.src(`{${distDir}/*,${demoDir}/*}`, { read: false })
		.pipe(clean())
})

/**
 * Compile SASS to CSS and move it to dist directory
 */
gulp.task('sass', () => {
	return gulp
		.src(`${srcDir}/scss/!(_)*.scss`)
		.pipe(debug())
		.pipe(sass({
			includePaths: ['node_modules'],
			style: 'expanded',
			precision: 7,
			importer: (url, prev, done) => {
				if (url[0] === '~') {
					url = path.resolve('node_modules', url.substr(1))
				}

				return { file: url }
			},
		}))
			.on('error', function (err) {
				throw err;
			})
		.pipe(postcss([
			require('autoprefixer'),
		]))
		.pipe(gulp.dest(`${distDir}/css/`))
		.pipe(browserSync.reload({
			stream: true,
		}));
})

gulp.task('css-rtl', function () {
	return gulp.src(`${distDir}/css/*.css`)
		.pipe(rtlcss())
		.pipe(rename((path) => {
			path.basename += '.rtl'
		}))
		.pipe(gulp.dest(`${distDir}/css/`))
});

/**
 * CSS minify
 */
gulp.task('css-minify', function () {
	return gulp.src(`${distDir}/css/!(*.min).css`)
		.pipe(debug())
		.pipe(cleanCSS())
		.pipe(rename((path) => {
			path.basename += '.min'
		}))
		.pipe(gulp.dest(`${distDir}/css/`))
})

/**
 * Compile JS files to dist directory
 */
let cache = {}

const compileJs = function (name, mjs = false) {
	if (!cache[name]) {
		cache[name] = null
	}

	const g = rollupStream({
		input: `${srcDir}/js/${name}.js`,
		cache: cache[name],
		output: {
			name: `${name}.js`,
			format: mjs ? 'es' : 'umd',
			...(mjs ? { exports: 'named' } : {})
		},
		plugins: [
			rollupReplace({
				'process.env.NODE_ENV': JSON.stringify(BUILD ? 'production' : 'development'),
				preventAssignment: false
			}),
			rollupBabel({
				exclude: 'node_modules/**'
			}),
			nodeResolve(),
			rollupCommonjs(),
			rollupCleanup()
		]
	})
		.on('bundle', (bundle) => {
			cache[name] = bundle
		})
		.pipe(vinylSource(`${name}.js`))
		.pipe(vinylBuffer())
		.pipe(rename((path) => {
			path.dirname = ''
		}))
		.pipe(gulp.dest(`${distDir}/js/`))
		.pipe(browserSync.reload({
			stream: true,
		}))

	if (BUILD) {
		g.pipe(minifyJS())
			.pipe(rename((path) => {
				path.extname = '.min.js'
			}))
			.pipe(gulp.dest(`${distDir}/js/`))
	}

	return g
}

/**
 * Compile JS files to dist directory
 */
gulp.task('js', () => {
	return compileJs('tabler')
})

gulp.task('js-demo', () => {
	return compileJs('demo')
})

gulp.task('js-demo-theme', () => {
	return compileJs('demo-theme')
})

/**
 * Compile JS module files to dist directory
 */
gulp.task('mjs', () => {
	return compileJs('tabler.esm', true)
})

let cacheEsm
gulp.task('mjs', () => {
	const g = rollupStream({
		input: `${srcDir}/js/tabler.esm.js`,
		cache: cacheEsm,
		output: {
			name: 'tabler.esm.js',
			format: 'es',
			exports: 'named'
		},
		plugins: [
			rollupReplace({
				'process.env.NODE_ENV': JSON.stringify(BUILD ? 'production' : 'development'),
				preventAssignment: false
			}),
			rollupBabel({
				exclude: 'node_modules/**'
			}),
			nodeResolve(),
			rollupCommonjs(),
			rollupCleanup()
		]
	})
		.on('bundle', (bundle) => {
			cacheEsm = bundle
		})
		.pipe(vinylSource('tabler.esm.js'))
		.pipe(vinylBuffer())
		.pipe(rename((path) => {
			path.dirname = ''
		}))
		.pipe(gulp.dest(`${distDir}/js/`))
		.pipe(browserSync.reload({
			stream: true,
		}))

	if (BUILD) {
		g.pipe(minifyJS())
			.pipe(rename((path) => {
				path.extname = '.min.js'
			}))
			.pipe(gulp.dest(`${distDir}/js/`))
	}

	return g
})

/**
 * Watch eleventy files and build it to demo directory
 */
gulp.task('watch-eleventy', (cb) => {
	browserSync.notify('Building eleventy')
	return spawn('pnpm', ['run', 'watch:html'], { stdio: 'inherit' })
		.on('close', cb)
})

/**
 * Build eleventy files do demo directory
 */
gulp.task('build-eleventy', (cb) => {
	var env = Object.create(process.env)

	if (argv.preview) {
		env.eleventy_ENV = 'preview'
	} else {
		env.eleventy_ENV = 'production'
	}

	return spawn('pnpm', ['run', 'build:html'], {
		env: env,
		stdio: 'inherit'
	})
		.on('close', cb)
})

gulp.task('build-cleanup', () => {
	return gulp
		.src(`${demoDir}/redirects.json`, { read: false, allowEmpty: true })
		.pipe(clean())
})

gulp.task('build-purgecss', (cb) => {
	if (argv.preview) {
		return gulp.src('demo/dist/{libs,css}/**/*.css')
			.pipe(purgecss({
				content: ['demo/**/*.html']
			}))
			.pipe(gulp.dest('demo/dist/css'))
	}

	cb()
})


/**
 * Watch JS and SCSS files
 */
gulp.task('watch', (cb) => {
	gulp.watch('./src/scss/**/*.scss', gulp.series('sass'))
	gulp.watch('./src/js/**/*.js', gulp.parallel('js', 'mjs', gulp.parallel('js-demo', 'js-demo-theme')))
	cb()
})

/**
 * Create BrowserSync server
 */
gulp.task('browser-sync', () => {
	browserSync({
		watch: true,
		server: {
			baseDir: demoDir,
			routes: {
				'/node_modules': 'node_modules',
				'/dist/img': `${srcDir}/img`,
				'/static': `${srcDir}/static`,
				'/dist': `${distDir}`,
			},
		},
		port: 3000,
		open: false,
		host: 'localhost',
		notify: false,
		reloadOnRestart: true
	})
})

/**
 * Copy libs used in tabler from npm to dist directory
 */
gulp.task('copy-libs', (cb) => {
	const allLibs = require(`${srcDir}/pages/_data/libs`)

	let files = []

	Object.keys(allLibs.js).forEach((lib) => {
		files.push(Array.isArray(allLibs.js[lib]) ? allLibs.js[lib] : [allLibs.js[lib]])
	})

	Object.keys(allLibs.css).forEach((lib) => {
		files.push(Array.isArray(allLibs.css[lib]) ? allLibs.css[lib] : [allLibs.css[lib]])
	})

	Object.keys(allLibs['js-copy']).forEach((lib) => {
		files.push(allLibs['js-copy'][lib])
	})

	files = files.flat()

	files.forEach((file) => {
		if (!file.match(/^https?/)) {
			let dirname = path.dirname(file).replace('@', '')
			let cmd = `mkdir -p "${distDir}/libs/${dirname}" && cp -r node_modules/${path.dirname(file)}/* ${distDir}/libs/${dirname}`

			cp.exec(cmd)
		}
	})

	cb()
})

/**
 * Copy static files (flags, payments images, etc) to dist directory
 */
gulp.task('copy-images', () => {
	return gulp
		.src(`${srcDir}/img/**/*`)
		.pipe(gulp.dest(`${distDir}/img`))
})

/**
 * Copy static files (demo images, etc) to demo directory
 */
gulp.task('copy-static', () => {
	return gulp
		.src(`${srcDir}/static/**/*`)
		.pipe(gulp.dest(`${demoDir}/static`))
})

/**
 * Copy Tabler dist files to demo directory
 */
gulp.task('copy-dist', () => {
	return gulp
		.src(`${distDir}/**/*`)
		.pipe(gulp.dest(`${demoDir}/dist/`))
})

/**
 * Add banner to build JS and CSS files
 */
gulp.task('add-banner', () => {
	return gulp.src(`${distDir}/{css,js}/**/*.{js,css}`)
		.pipe(header(getBanner()))
		.pipe(replace(/^([\s\S]+)(@charset "UTF-8";)\n?/, '$2\n$1'))
		.pipe(gulp.dest(`${distDir}`))
})

gulp.task('clean', gulp.series('clean-dirs'))

gulp.task('start', gulp.series('clean', 'sass', 'js', gulp.parallel('js-demo', 'js-demo-theme'), 'mjs', 'build-eleventy', gulp.parallel('watch-eleventy', 'watch', 'browser-sync')))

gulp.task('build-core', gulp.series('build-on', 'clean', 'sass', 'css-rtl', 'css-minify', 'js', gulp.parallel('js-demo', 'js-demo-theme'), 'mjs', 'copy-images', 'copy-libs', 'add-banner'))
gulp.task('build-demo', gulp.series('build-on', 'build-eleventy', 'copy-static', 'copy-dist', 'build-cleanup', 'build-purgecss'))
gulp.task('build', gulp.series('build-core', 'build-demo'))
