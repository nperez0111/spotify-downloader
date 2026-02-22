import { toast } from 'vue-sonner'

export function notifySuccess(message, description = '') {
  toast.success(message, {
    description,
    duration: 4000,
  })
}

export function notifyError(message, description = '') {
  toast.error(message, {
    description,
    duration: 5000,
  })
}

export function notifyInfo(message, description = '') {
  toast.info(message, {
    description,
    duration: 3000,
  })
}

export function notifyWarning(message, description = '') {
  toast.warning(message, {
    description,
    duration: 4000,
  })
}

export function notifyLoading(message, description = '') {
  return toast.loading(message, {
    description,
  })
}

export function dismissNotification(toastId) {
  toast.dismiss(toastId)
}
