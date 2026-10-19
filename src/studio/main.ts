import './studio.css'

/** The studio shell: a slide-out drawer that switches between sections. */

const drawer = document.getElementById('drawer')!
const scrim = document.getElementById('scrim')!
const menu = document.getElementById('menu')!
const title = document.getElementById('title')!
const VIEWS = ['home', 'audio', 'visuals', 'writing', 'timeline']

function setDrawer(open: boolean) {
  drawer.classList.toggle('open', open)
  menu.setAttribute('aria-expanded', String(open))
  if (open) {
    scrim.hidden = false
    requestAnimationFrame(() => scrim.classList.add('open'))
  } else {
    scrim.classList.remove('open')
    setTimeout(() => {
      if (!drawer.classList.contains('open')) scrim.hidden = true
    }, 200)
  }
}

function showView() {
  const name = location.hash.slice(1)
  const view = VIEWS.includes(name) ? name : 'home'
  for (const s of document.querySelectorAll<HTMLElement>('main section')) s.hidden = s.dataset.view !== view
  for (const a of drawer.querySelectorAll<HTMLAnchorElement>('a')) a.classList.toggle('active', a.dataset.view === view)
  title.textContent = drawer.querySelector(`a[data-view="${view}"] span`)!.firstChild!.textContent!.trim()
}

menu.addEventListener('click', () => setDrawer(!drawer.classList.contains('open')))
scrim.addEventListener('click', () => setDrawer(false))
drawer.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('a')) setDrawer(false)
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setDrawer(false)
})
window.addEventListener('hashchange', showView)
showView()
