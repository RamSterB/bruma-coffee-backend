import { REFRESH_COOKIE, CSRF_COOKIE } from './auth-cookie'
import type { CookieOptions } from 'express'
import {
  cookieOptions,
  csrfCookieOptions,
  setAuthCookies,
  clearAuthCookies,
  readRefreshCookie,
} from './auth-cookie'

describe('constantes de las cookies de sesion', () => {
  it('la cookie del refresh se llama refresh_token', () => {
    expect(REFRESH_COOKIE).toBe('refresh_token')
  })

  it('la cookie del CSRF se llama csrf_token', () => {
    expect(CSRF_COOKIE).toBe('csrf_token')
  })

  it('la cookie del refresh va a las rutas de autenticacion, con el prefijo de la API', () => {
    // La API vive bajo /api, así que las rutas reales son /api/auth/*. Con el
    // path en /auth el navegador no enviaba la cookie a /api/auth/refresh, y la
    // sesión se cerraba sola al recargar.
    expect(cookieOptions(false).path).toBe('/api/auth')
  })

  it('la cookie del CSRF se puede leer desde la pagina, o no hay doble envio posible', () => {
    // El doble envío necesita que JavaScript lea el valor. El navegador solo
    // expone a document.cookie las cookies cuyo path coincide con el de la
    // página, y la página es /, no /api/auth.
    expect(csrfCookieOptions(false).path).toBe('/')
  })
})

describe('cookieOptions', () => {
  it('es httpOnly e invisible para JavaScript', () => {
    expect(cookieOptions(false).httpOnly).toBe(true)
  })

  it('va con SameSite Lax, que es lo que permite la compra directa desde otro sitio', () => {
    expect(cookieOptions(false).sameSite).toBe('lax')
  })

  it('en produccion lleva Secure, y en desarrollo no, porque en local hay http', () => {
    expect(cookieOptions(true).secure).toBe(true)
    expect(cookieOptions(false).secure).toBe(false)
  })

  it('es de sesion del navegador en el logout: se borra al cerrar, sin maxAge', () => {
    expect(cookieOptions(false).maxAge).toBeUndefined()
  })
})

describe('setAuthCookies', () => {
  it('pone el refresh en httpOnly y el CSRF en una cookie que JavaScript si puede leer', () => {
    const Written: { name: string; value: string; options: CookieOptions }[] = []
    const res = {
      cookie: (name: string, value: string, options: CookieOptions) => {
        Written.push({ name, value, options })
        return res
      },
    }

    setAuthCookies(res as never, 'refresh-opaco', 'csrf-legible', 604800000, false)

    const refresh = Written.find((c) => c.name === REFRESH_COOKIE)
    const csrf = Written.find((c) => c.name === CSRF_COOKIE)

    expect(refresh?.options.httpOnly).toBe(true)
    expect(csrf?.options.httpOnly).toBe(false)
  })

  it('el valor del CSRF va en la cookie y en el cuerpo, para que el cliente lo copie', () => {
    const Written: { name: string; value: string }[] = []
    const res = {
      cookie: (name: string, value: string) => {
        Written.push({ name, value })
        return res
      },
    }

    setAuthCookies(res as never, 'refresh-opaco', 'csrf-legible', 604800000, false)

    expect(Written.find((c) => c.name === CSRF_COOKIE)?.value).toBe('csrf-legible')
  })

  it('el refresh nunca viaja en el cuerpo de la respuesta', () => {
    const Written: string[] = []
    const res = {
      cookie: (name: string) => {
        Written.push(name)
        return res
      },
    }

    setAuthCookies(res as never, 'refresh-opaco', 'csrf-legible', 604800000, false)

    expect(Written).not.toContain('access_token')
  })
})

describe('clearAuthCookies', () => {
  it('borra las dos cookies con los mismos atributos con las que se pusieron', () => {
    const Written: { name: string; options: CookieOptions }[] = []
    const res = {
      clearCookie: (name: string, options: CookieOptions) => {
        Written.push({ name, options })
        return res
      },
    }

    clearAuthCookies(res as never, true)

    expect(Written.map((c) => c.name).sort()).toEqual([CSRF_COOKIE, REFRESH_COOKIE].sort())
    expect(Written.every((c) => c.options.httpOnly === true || c.name === CSRF_COOKIE)).toBe(true)
  })
})

describe('readRefreshCookie', () => {
  it('devuelve el token que viene en la cookie', () => {
    const cookies = { [REFRESH_COOKIE]: 'refresh-opaco' }

    expect(readRefreshCookie(cookies)).toBe('refresh-opaco')
  })

  it('devuelve null si no hay cookie de refresh', () => {
    expect(readRefreshCookie({})).toBeNull()
  })

  it('devuelve null si llega un array, que es lo que pasa con cookies duplicadas', () => {
    expect(readRefreshCookie({ [REFRESH_COOKIE]: ['uno', 'dos'] })).toBeNull()
  })
})
