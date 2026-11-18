// Матчеры Testing Library (`toBeInTheDocument` и другие) и очистка DOM после каждого теста.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})
