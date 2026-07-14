import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json(
    { error: "Member data export is not available. BinPerks owns all member data." },
    { status: 403 }
  )
}
