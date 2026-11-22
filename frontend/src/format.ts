const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' })

const dateTime = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const monthDay = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo',
  month: 'numeric',
  day: 'numeric',
})

export const formatPrice = (amount: number) => yen.format(amount)

export const formatDate = (iso: string) => dateTime.format(new Date(iso))

export const shortDate = (iso: string) => monthDay.format(new Date(iso))
