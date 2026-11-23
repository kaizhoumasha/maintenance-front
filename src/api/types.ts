export interface ErrorBody {
  trace_id: string
  code: string
  message: string
  detail: string | null
}

export interface TokenPair {
  access_token: string
  token_type: string
}