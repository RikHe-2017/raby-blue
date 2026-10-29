export async function formatCode(source: string): Promise<string> {
  const [{ format }, babel, estree] = await Promise.all([
    import('prettier/standalone'),
    import('prettier/plugins/babel'),
    import('prettier/plugins/estree')
  ])

  return format(source, {
    parser: 'babel',
    plugins: [babel.default, estree.default],
    tabWidth: 2,
    semi: false,
    singleQuote: true
  })
}
