import { CsrfGuard } from './csrf.guard'
import { REFRESH_COOKIE, CSRF_COOKIE } from './auth-cookie'

const peticion = (cookies: unknown, headers: Record<string, string | undefined> = {}) => ({
  switchToHttp: () => ({
    getRequest: () => ({ cookies, headers, method: 'POST', path: '/auth/refresh' }),
  }),
  getHandler: () => () => undefined,
  getClass: () => class {},
})

describe('CsrfGuard', () => {
  it('deja pasar cuando la cabecera y la cookie tienen el mismo valor', () => {
    const guard = new CsrfGuard()

    expect(
      guard.canActivate(
        peticion(
          { [REFRESH_COOKIE]: 'refresh-1', [CSRF_COOKIE]: 'abc' },
          { 'x-csrf-token': 'abc' },
        ) as never,
      ),
    ).toBe(true)
  })

  it('rechaza cuando la cabecera y la cookie no coinciden, que es el CSRF clasico', () => {
    const guard = new CsrfGuard()

    expect(() =>
      guard.canActivate(
        peticion(
          { [REFRESH_COOKIE]: 'refresh-1', [CSRF_COOKIE]: 'abc' },
          { 'x-csrf-token': 'otro' },
        ) as never,
      ),
    ).toThrow()
  })

  it('rechaza cuando no hay cookie de CSRF', () => {
    const guard = new CsrfGuard()

    expect(() =>
      guard.canActivate(
        peticion({ [REFRESH_COOKIE]: 'refresh-1' }, { 'x-csrf-token': 'abc' }) as never,
      ),
    ).toThrow()
  })

  it('rechaza cuando no hay cabecera, que es una peticion que no viene del frontend', () => {
    const guard = new CsrfGuard()

    expect(() =>
      guard.canActivate(peticion({ [REFRESH_COOKIE]: 'refresh-1', [CSRF_COOKIE]: 'abc' }) as never),
    ).toThrow()
  })

  it('rechaza un valor vacio, que compararia como igual a si mismo', () => {
    const guard = new CsrfGuard()

    expect(() =>
      guard.canActivate(
        peticion(
          { [REFRESH_COOKIE]: 'refresh-1', [CSRF_COOKIE]: '' },
          { 'x-csrf-token': '' },
        ) as never,
      ),
    ).toThrow()
  })

  it('solo exige CSRF si viene cookie de refresh, que es cuando la peticion tiene efecto', () => {
    const guard = new CsrfGuard()

    expect(() =>
      guard.canActivate(
        peticion({ [REFRESH_COOKIE]: 'refresh-1' }, { 'x-csrf-token': 'abc' }) as never,
      ),
    ).toThrow()
  })

  it('deja pasar una peticion sin cookie de refresh, que es un login o un registro', () => {
    const guard = new CsrfGuard()

    expect(guard.canActivate(peticion({}) as never)).toBe(true)
  })

  it('deja pasar los metodos que no cambian estado, para que la documentacion.swagger no CSRF-ee', () => {
    const guard = new CsrfGuard()
    const metodoSeguro = {
      switchToHttp: () => ({
        getRequest: () => ({ cookies: {}, headers: {}, method: 'GET', path: '/auth/me' }),
      }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    }

    expect(guard.canActivate(metodoSeguro as never)).toBe(true)
  })
})
