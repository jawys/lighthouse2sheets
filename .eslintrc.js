module.exports = {
	parser: 'babel-eslint',
	parserOptions: {
		sourceType: 'module',
	},
	extends: ['airbnb-base'],
	rules: {
		'arrow-parens': 0,
		'comma-dangle': 0,
		indent: [2, 'tab'],
		'linebreak-style': [2, 'unix'],
		'no-param-reassign': 0,
		'no-tabs': 0,
		'no-undef': 1,
		'no-unused-vars': 1,
		quotes: [2, 'single'],
		semi: [2, 'always'],
		'template-curly-spacing': [2, 'always'],
	},
};
